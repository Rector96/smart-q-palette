
begin;

-- =========================================================
-- 1. CREATE EXAM SESSION AND SAVE QUESTION SNAPSHOTS
-- =========================================================

create or replace function private.create_sdashapi_exam_session(
  p_user_id uuid,
  p_examination text,
  p_subject text,
  p_exam_year integer,
  p_questions jsonb,
  p_duration_seconds integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_question jsonb;
  v_position integer := 0;
  v_question_id bigint;
  v_question_text text;
  v_options jsonb;
  v_answer text;
  v_solution text;
  v_image text;
  v_total integer;
begin
  if p_user_id is null then
    raise exception 'User ID is required';
  end if;

  if p_examination is null
     or p_examination not in ('WAEC', 'JAMB') then
    raise exception 'Unsupported examination';
  end if;

  if nullif(pg_catalog.btrim(p_subject), '') is null then
    raise exception 'Subject is required';
  end if;

  if p_exam_year is null or p_exam_year not between 1900 and 2100 then
    raise exception 'Invalid examination year';
  end if;

  if p_duration_seconds is null
     or p_duration_seconds < 0
     or p_duration_seconds > 86400 then
    raise exception 'Invalid exam duration';
  end if;

  if p_questions is null
     or pg_catalog.jsonb_typeof(p_questions) <> 'array' then
    raise exception 'Questions must be a JSON array';
  end if;

  v_total := pg_catalog.jsonb_array_length(p_questions);

  if v_total < 1 or v_total > 100 then
    raise exception 'Question count must be between 1 and 100';
  end if;

  insert into public.sdashapi_exam_sessions (
    user_id,
    examination,
    subject,
    exam_year,
    total_questions,
    duration_seconds
  )
  values (
    p_user_id,
    p_examination,
    pg_catalog.btrim(p_subject),
    p_exam_year,
    v_total,
    p_duration_seconds
  )
  returning id into v_session_id;

  for v_question in
    select value
    from pg_catalog.jsonb_array_elements(p_questions)
  loop
    v_position := v_position + 1;

    if pg_catalog.jsonb_typeof(v_question) <> 'object'
       or coalesce(v_question ->> 'id', '')
          !~ '^[1-9][0-9]{0,17}$' then
      raise exception 'Invalid question ID at position %', v_position;
    end if;

    v_question_id := (v_question ->> 'id')::bigint;
    v_question_text := nullif(
      pg_catalog.btrim(v_question ->> 'question'), ''
    );
    v_options := v_question -> 'options';
    v_answer := pg_catalog.upper(
      pg_catalog.btrim(coalesce(v_question ->> 'answer', ''))
    );
    v_solution := nullif(v_question ->> 'solution', '');
    v_image := nullif(v_question ->> 'image', '');

    if v_question_text is null then
      raise exception 'Question text is missing at position %', v_position;
    end if;

    if v_options is null
       or pg_catalog.jsonb_typeof(v_options) <> 'object' then
      raise exception 'Invalid options at position %', v_position;
    end if;

    if v_answer not in ('A', 'B', 'C', 'D', 'E') then
      raise exception 'Invalid answer key at position %', v_position;
    end if;

    if coalesce(
      nullif(pg_catalog.btrim(v_options ->> pg_catalog.lower(v_answer)), ''),
      nullif(pg_catalog.btrim(v_options ->> v_answer), '')
    ) is null then
      raise exception 'Correct answer option is missing at position %',
        v_position;
    end if;

    insert into public.sdashapi_session_questions (
      session_id,
      position,
      sdashapi_question_id,
      question_text,
      options,
      image
    )
    values (
      v_session_id,
      v_position,
      v_question_id,
      v_question_text,
      v_options,
      v_image
    );

    insert into private.sdashapi_answer_keys (
      session_id,
      question_position,
      correct_answer,
      solution
    )
    values (
      v_session_id,
      v_position,
      v_answer,
      v_solution
    );
  end loop;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'session_id', v_session_id,
    'total_questions', v_total,
    'status', 'in_progress'
  );
end;
$$;


-- =========================================================
-- 2. SUBMIT ANSWERS AND CALCULATE SCORE SERVER-SIDE
-- =========================================================

create or replace function private.submit_sdashapi_exam_session(
  p_session_id uuid,
  p_user_id uuid,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sdashapi_exam_sessions%rowtype;
  v_question record;
  v_answer_item jsonb;
  v_selected text;
  v_correct text;
  v_time integer;
  v_is_correct boolean;
  v_correct_count integer := 0;
  v_score numeric(5,2);
  v_answer_count integer;
  v_question_count integer;
  v_key_count integer;
  v_position integer;
  v_raw_time text;
begin
  if p_session_id is null or p_user_id is null then
    raise exception 'Session and user are required';
  end if;

  if p_answers is null
     or pg_catalog.jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Answers must be a JSON array';
  end if;

  select *
  into v_session
  from public.sdashapi_exam_sessions
  where id = p_session_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Exam session not found';
  end if;

  if v_session.status <> 'in_progress' then
    raise exception 'This exam has already been submitted or expired';
  end if;

  v_answer_count := pg_catalog.jsonb_array_length(p_answers);

  if v_answer_count > v_session.total_questions then
    raise exception 'Too many submitted answers';
  end if;

  -- Validate every submitted answer before any scoring.

  for v_answer_item in
    select value
    from pg_catalog.jsonb_array_elements(p_answers)
  loop
    if pg_catalog.jsonb_typeof(v_answer_item) <> 'object' then
      raise exception 'Each submitted answer must be an object';
    end if;

    if coalesce(v_answer_item ->> 'position', '')
       !~ '^[0-9]{1,3}$' then
      raise exception 'Invalid answer position';
    end if;

    v_position := (v_answer_item ->> 'position')::integer;

    if v_position < 1
       or v_position > v_session.total_questions then
      raise exception 'Answer position is outside the exam range';
    end if;

    v_raw_time := coalesce(
      v_answer_item ->> 'time_spent_seconds',
      '0'
    );

    if v_raw_time !~ '^[0-9]{1,5}$' then
      raise exception 'Invalid time spent value';
    end if;

    if v_raw_time::integer > 86400 then
      raise exception 'Time spent exceeds the allowed limit';
    end if;

    if nullif(
      pg_catalog.btrim(v_answer_item ->> 'selected_answer'),
      ''
    ) is not null
       and pg_catalog.upper(
         pg_catalog.btrim(v_answer_item ->> 'selected_answer')
       ) not in ('A', 'B', 'C', 'D', 'E') then
      raise exception 'Invalid selected answer';
    end if;
  end loop;

  -- Reject duplicates after converting positions to integers.
  -- This also catches positions such as 1 and 01.

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_answers) as a(value)
    group by ((a.value ->> 'position')::integer)
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'Duplicate answer positions';
  end if;

  -- Ensure all questions and private answer keys exist.

  select pg_catalog.count(*)
  into v_question_count
  from public.sdashapi_session_questions
  where session_id = p_session_id;

  select pg_catalog.count(*)
  into v_key_count
  from private.sdashapi_answer_keys
  where session_id = p_session_id;

  if v_question_count <> v_session.total_questions
     or v_key_count <> v_session.total_questions then
    raise exception 'Exam question or answer-key data is incomplete';
  end if;

  -- Score each question using the private answer key.

  for v_question in
    select q.position, k.correct_answer
    from public.sdashapi_session_questions q
    join private.sdashapi_answer_keys k
      on k.session_id = q.session_id
     and k.question_position = q.position
    where q.session_id = p_session_id
    order by q.position
  loop
    v_selected := null;
    v_time := 0;
    v_correct := v_question.correct_answer;

    select
      nullif(
        pg_catalog.upper(
          pg_catalog.btrim(a.value ->> 'selected_answer')
        ),
        ''
      ),
      coalesce(
        (a.value ->> 'time_spent_seconds')::integer,
        0
      )
    into v_selected, v_time
    from pg_catalog.jsonb_array_elements(p_answers) as a(value)
    where (a.value ->> 'position')::integer = v_question.position;

    if not found then
      v_selected := null;
      v_time := 0;
    end if;

    v_is_correct := v_selected is not null
                    and v_selected = v_correct;

    if v_is_correct then
      v_correct_count := v_correct_count + 1;
    end if;

    insert into public.sdashapi_attempt_answers (
      session_id,
      question_position,
      selected_answer,
      time_spent_seconds,
      is_correct
    )
    values (
      p_session_id,
      v_question.position,
      v_selected,
      v_time,
      v_is_correct
    );
  end loop;

  v_score := pg_catalog.round(
    (v_correct_count::numeric / v_session.total_questions) * 100,
    2
  );

  update public.sdashapi_exam_sessions
  set
    status = 'submitted',
    correct_count = v_correct_count,
    score = v_score,
    submitted_at = pg_catalog.now()
  where id = p_session_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'session_id', p_session_id,
    'total_questions', v_session.total_questions,
    'correct_count', v_correct_count,
    'score', v_score,
    'status', 'submitted'
  );
end;
$$;


-- =========================================================
-- 3. RETURN ANSWER REVIEW ONLY AFTER SUBMISSION
-- =========================================================

create or replace function private.get_sdashapi_exam_result(
  p_session_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sdashapi_exam_sessions%rowtype;
  v_questions jsonb;
begin
  if p_session_id is null or p_user_id is null then
    raise exception 'Session and user are required';
  end if;

  select *
  into v_session
  from public.sdashapi_exam_sessions
  where id = p_session_id
    and user_id = p_user_id;

  if not found then
    raise exception 'Exam session not found';
  end if;

  if v_session.status <> 'submitted' then
    raise exception 'Results are not available until submission';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'position', q.position,
        'question', q.question_text,
        'options', q.options,
        'image', q.image,
        'selected_answer', a.selected_answer,
        'correct_answer', k.correct_answer,
        'is_correct', a.is_correct,
        'solution', k.solution,
        'time_spent_seconds', a.time_spent_seconds
      )
      order by q.position
    ),
    '[]'::jsonb
  )
  into v_questions
  from public.sdashapi_session_questions q
  join private.sdashapi_answer_keys k
    on k.session_id = q.session_id
   and k.question_position = q.position
  left join public.sdashapi_attempt_answers a
    on a.session_id = q.session_id
   and a.question_position = q.position
  where q.session_id = p_session_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'session_id', v_session.id,
    'examination', v_session.examination,
    'subject', v_session.subject,
    'exam_year', v_session.exam_year,
    'total_questions', v_session.total_questions,
    'correct_count', v_session.correct_count,
    'score', v_session.score,
    'duration_seconds', v_session.duration_seconds,
    'started_at', v_session.started_at,
    'submitted_at', v_session.submitted_at,
    'questions', v_questions
  );
end;
$$;


-- =========================================================
-- 4. PRIVATE FUNCTION PERMISSIONS
-- =========================================================

revoke all on function private.create_sdashapi_exam_session(
  uuid, text, text, integer, jsonb, integer
) from public, anon, authenticated;

revoke all on function private.submit_sdashapi_exam_session(
  uuid, uuid, jsonb
) from public, anon, authenticated;

revoke all on function private.get_sdashapi_exam_result(
  uuid, uuid
) from public, anon, authenticated;

grant execute on function private.create_sdashapi_exam_session(
  uuid, text, text, integer, jsonb, integer
) to service_role;

grant execute on function private.submit_sdashapi_exam_session(
  uuid, uuid, jsonb
) to service_role;

grant execute on function private.get_sdashapi_exam_result(
  uuid, uuid
) to service_role;


-- =========================================================
-- 5. PUBLIC RPC WRAPPERS FOR SERVER-SIDE CALLS
-- =========================================================

create or replace function public.create_sdashapi_exam_session(
  p_user_id uuid,
  p_examination text,
  p_subject text,
  p_exam_year integer,
  p_questions jsonb,
  p_duration_seconds integer default 0
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.create_sdashapi_exam_session(
    p_user_id,
    p_examination,
    p_subject,
    p_exam_year,
    p_questions,
    p_duration_seconds
  );
$$;

create or replace function public.submit_sdashapi_exam_session(
  p_session_id uuid,
  p_user_id uuid,
  p_answers jsonb
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.submit_sdashapi_exam_session(
    p_session_id,
    p_user_id,
    p_answers
  );
$$;

create or replace function public.get_sdashapi_exam_result(
  p_session_id uuid,
  p_user_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.get_sdashapi_exam_result(
    p_session_id,
    p_user_id
  );
$$;


-- =========================================================
-- 6. PUBLIC WRAPPER PERMISSIONS
-- =========================================================

revoke all on function public.create_sdashapi_exam_session(
  uuid, text, text, integer, jsonb, integer
) from public, anon, authenticated;

revoke all on function public.submit_sdashapi_exam_session(
  uuid, uuid, jsonb
) from public, anon, authenticated;

revoke all on function public.get_sdashapi_exam_result(
  uuid, uuid
) from public, anon, authenticated;

grant execute on function public.create_sdashapi_exam_session(
  uuid, text, text, integer, jsonb, integer
) to service_role;

grant execute on function public.submit_sdashapi_exam_session(
  uuid, uuid, jsonb
) to service_role;

grant execute on function public.get_sdashapi_exam_result(
  uuid, uuid
) to service_role;

commit;
