begin;

-- Practice records answers immediately to unlock feedback. Final submission
-- must update those rows rather than fail on the unique session/position key.
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
    )
    on conflict (session_id, question_position)
    do update set
      selected_answer = excluded.selected_answer,
      time_spent_seconds = excluded.time_spent_seconds,
      is_correct = excluded.is_correct;
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

commit;
