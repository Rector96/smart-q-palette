-- Enable NECO sessions in the SdashAPI past-question flow.
-- Keep this validation in sync with supabase/functions/sdashapi-start/index.ts.

alter table public.sdashapi_exam_sessions
  drop constraint if exists sdashapi_exam_sessions_examination_check;

alter table public.sdashapi_exam_sessions
  add constraint sdashapi_exam_sessions_examination_check
  check (examination = any (array['WAEC'::text, 'JAMB'::text, 'NECO'::text]));

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
set search_path to ''
as $function$
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
     or p_examination not in ('WAEC', 'JAMB', 'NECO') then
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
    user_id, examination, subject, exam_year, total_questions, duration_seconds
  )
  values (
    p_user_id, p_examination, pg_catalog.btrim(p_subject),
    p_exam_year, v_total, p_duration_seconds
  )
  returning id into v_session_id;

  for v_question in
    select value from pg_catalog.jsonb_array_elements(p_questions)
  loop
    v_position := v_position + 1;

    if pg_catalog.jsonb_typeof(v_question) <> 'object'
       or coalesce(v_question ->> 'id', '') !~ '^[1-9][0-9]{0,17}$' then
      raise exception 'Invalid question ID at position %', v_position;
    end if;

    v_question_id := (v_question ->> 'id')::bigint;
    v_question_text := nullif(pg_catalog.btrim(v_question ->> 'question'), '');
    v_options := v_question -> 'options';
    v_answer := pg_catalog.upper(pg_catalog.btrim(coalesce(v_question ->> 'answer', '')));
    v_solution := nullif(v_question ->> 'solution', '');
    v_image := nullif(v_question ->> 'image', '');

    if v_question_text is null then
      raise exception 'Question text is missing at position %', v_position;
    end if;

    if v_options is null or pg_catalog.jsonb_typeof(v_options) <> 'object' then
      raise exception 'Invalid options at position %', v_position;
    end if;

    if v_answer not in ('A', 'B', 'C', 'D', 'E') then
      raise exception 'Invalid answer key at position %', v_position;
    end if;

    if coalesce(
      nullif(pg_catalog.btrim(v_options ->> pg_catalog.lower(v_answer)), ''),
      nullif(pg_catalog.btrim(v_options ->> v_answer), '')
    ) is null then
      raise exception 'Correct answer option is missing at position %', v_position;
    end if;

    insert into public.sdashapi_session_questions (
      session_id, position, sdashapi_question_id, question_text, options, image
    )
    values (
      v_session_id, v_position, v_question_id, v_question_text, v_options, v_image
    );

    insert into private.sdashapi_answer_keys (
      session_id, question_position, correct_answer, solution
    )
    values (v_session_id, v_position, v_answer, v_solution);
  end loop;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'session_id', v_session_id,
    'total_questions', v_total, 'status', 'in_progress'
  );
end;
$function$;
