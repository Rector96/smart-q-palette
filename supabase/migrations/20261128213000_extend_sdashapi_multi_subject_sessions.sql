begin;

-- Extend the existing isolated SdashAPI snapshot store to support the same
-- one-subject and four-subject session contract as the local CBT flow.
alter table public.sdashapi_exam_sessions
  add column if not exists exam_mode text not null default 'cbt'
    check (exam_mode in ('practice', 'cbt', 'mock')),
  add column if not exists subjects text[] not null default '{}',
  add column if not exists subject_question_counts jsonb not null default '{}'::jsonb,
  add column if not exists allowed_duration_seconds integer not null default 0
    check (allowed_duration_seconds between 0 and 86400);

alter table public.sdashapi_exam_sessions
  drop constraint if exists sdashapi_exam_sessions_total_questions_check;
alter table public.sdashapi_exam_sessions
  add constraint sdashapi_exam_sessions_total_questions_check
  check (total_questions between 1 and 240);

alter table public.sdashapi_session_questions
  drop constraint if exists sdashapi_session_questions_position_check;
alter table public.sdashapi_session_questions
  add constraint sdashapi_session_questions_position_check
  check (position between 1 and 240);

alter table public.sdashapi_session_questions
  add column if not exists subject text;

update public.sdashapi_session_questions q
set subject = s.subject
from public.sdashapi_exam_sessions s
where s.id = q.session_id
  and q.subject is null;

alter table public.sdashapi_session_questions
  alter column subject set not null;

create index if not exists sdashapi_questions_subject_idx
  on public.sdashapi_session_questions(session_id, subject, position);

-- New RPC keeps the legacy single-subject creation RPC intact.
create or replace function private.create_sdashapi_multi_subject_exam_session(
  p_user_id uuid,
  p_mode text,
  p_examination text,
  p_exam_year integer,
  p_subjects text[],
  p_subject_question_counts jsonb,
  p_questions jsonb,
  p_duration_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session_id uuid;
  v_question jsonb;
  v_position integer := 0;
  v_total integer;
  v_subject text;
  v_count integer;
  v_question_subject text;
  v_question_text text;
  v_options jsonb;
  v_answer text;
  v_solution text;
  v_image text;
  v_question_id bigint;
  v_subject_counts jsonb := '{}'::jsonb;
begin
  if p_user_id is null then
    raise exception 'User ID is required';
  end if;

  if p_mode not in ('practice', 'cbt', 'mock') then
    raise exception 'Invalid exam mode';
  end if;

  if p_examination not in ('WAEC', 'JAMB', 'NECO') then
    raise exception 'Unsupported examination';
  end if;

  if p_exam_year is null or p_exam_year not between 1900 and 2100 then
    raise exception 'Invalid examination year';
  end if;

  if p_subjects is null
     or cardinality(p_subjects) < 1
     or cardinality(p_subjects) > 4
     or array_position(p_subjects, null) is not null
     or exists (select 1 from unnest(p_subjects) s where btrim(s) = '')
     or cardinality(p_subjects) <> (select count(distinct lower(btrim(s))) from unnest(p_subjects) s)
  then
    raise exception 'Select valid, unique subjects';
  end if;

  if (p_mode in ('practice', 'cbt') and cardinality(p_subjects) <> 1)
     or (p_mode = 'mock' and cardinality(p_subjects) <> 4) then
    raise exception 'The selected mode has an invalid subject count';
  end if;

  if p_mode = 'practice' then
    if p_duration_seconds <> 0 then
      raise exception 'Practice mode must be untimed';
    end if;
  elsif p_duration_seconds is null or p_duration_seconds < 60 or p_duration_seconds > 86400 then
    raise exception 'Timed exams require a duration between 60 and 86400 seconds';
  end if;

  if jsonb_typeof(p_subject_question_counts) is distinct from 'object'
     or jsonb_typeof(p_questions) is distinct from 'array' then
    raise exception 'Invalid question allocation';
  end if;

  if (select count(*) from jsonb_object_keys(p_subject_question_counts)) <> cardinality(p_subjects) then
    raise exception 'Question counts must match the selected subjects';
  end if;

  v_total := jsonb_array_length(p_questions);
  if v_total < 1 or v_total > 240 then
    raise exception 'Total questions must be between 1 and 240';
  end if;

  foreach v_subject in array p_subjects loop
    if not (p_subject_question_counts ? v_subject)
       or coalesce(p_subject_question_counts ->> v_subject, '') !~ '^[0-9]{1,2}$' then
      raise exception 'Invalid question count for a selected subject';
    end if;
    v_count := (p_subject_question_counts ->> v_subject)::integer;
    if v_count < 1 or v_count > 60 then
      raise exception 'Each subject must contain between 1 and 60 questions';
    end if;
    v_subject_counts := v_subject_counts || jsonb_build_object(v_subject, 0);
  end loop;

  if (select sum(value::integer) from jsonb_each_text(p_subject_question_counts)) <> v_total then
    raise exception 'Question allocation does not match total question count';
  end if;

  insert into public.sdashapi_exam_sessions (
    user_id, examination, subject, exam_year, status, total_questions,
    duration_seconds, exam_mode, subjects, subject_question_counts,
    allowed_duration_seconds
  )
  values (
    p_user_id, p_examination,
    case when cardinality(p_subjects) = 1 then p_subjects[1] else 'Multiple subjects' end,
    p_exam_year, 'in_progress', v_total, 0, p_mode, p_subjects,
    p_subject_question_counts, p_duration_seconds
  )
  returning id into v_session_id;

  for v_question in select value from jsonb_array_elements(p_questions) loop
    v_position := v_position + 1;
    if jsonb_typeof(v_question) <> 'object'
       or coalesce(v_question ->> 'id', '') !~ '^[1-9][0-9]{0,17}$' then
      raise exception 'Invalid question ID at position %', v_position;
    end if;

    v_question_id := (v_question ->> 'id')::bigint;
    v_question_subject := nullif(btrim(v_question ->> 'subject'), '');
    if v_question_subject is null or not (v_question_subject = any(p_subjects)) then
      raise exception 'Invalid question subject at position %', v_position;
    end if;

    v_question_text := nullif(btrim(v_question ->> 'question'), '');
    v_options := v_question -> 'options';
    v_answer := upper(btrim(coalesce(v_question ->> 'answer', '')));
    v_solution := nullif(v_question ->> 'solution', '');
    v_image := nullif(v_question ->> 'image', '');

    if v_question_text is null then
      raise exception 'Question text is missing at position %', v_position;
    end if;
    if v_options is null or jsonb_typeof(v_options) <> 'object' then
      raise exception 'Invalid options at position %', v_position;
    end if;
    if v_answer not in ('A', 'B', 'C', 'D', 'E')
       or coalesce(nullif(btrim(v_options ->> lower(v_answer)), ''),
                   nullif(btrim(v_options ->> v_answer), '')) is null then
      raise exception 'Invalid answer key or missing correct option at position %', v_position;
    end if;

    insert into public.sdashapi_session_questions (
      session_id, position, sdashapi_question_id, question_text,
      options, image, subject
    )
    values (
      v_session_id, v_position, v_question_id, v_question_text,
      v_options, v_image, v_question_subject
    );

    insert into private.sdashapi_answer_keys (
      session_id, question_position, correct_answer, solution
    )
    values (v_session_id, v_position, v_answer, v_solution);

    v_subject_counts := jsonb_set(
      v_subject_counts,
      array[v_question_subject],
      to_jsonb(coalesce((v_subject_counts ->> v_question_subject)::integer, 0) + 1)
    );
  end loop;

  foreach v_subject in array p_subjects loop
    if (v_subject_counts ->> v_subject)::integer
       <> (p_subject_question_counts ->> v_subject)::integer then
      raise exception 'Question allocation does not match selected subject counts';
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'session_id', v_session_id,
    'total_questions', v_total,
    'subjects', to_jsonb(p_subjects),
    'subject_question_counts', p_subject_question_counts,
    'exam_mode', p_mode,
    'allowed_duration_seconds', p_duration_seconds,
    'status', 'in_progress'
  );
end;
$function$;

revoke all on function private.create_sdashapi_multi_subject_exam_session(
  uuid, text, text, integer, text[], jsonb, jsonb, integer
) from public, anon, authenticated;

grant execute on function private.create_sdashapi_multi_subject_exam_session(
  uuid, text, text, integer, text[], jsonb, jsonb, integer
) to service_role;

create or replace function public.create_sdashapi_multi_subject_exam_session(
  p_user_id uuid,
  p_mode text,
  p_examination text,
  p_exam_year integer,
  p_subjects text[],
  p_subject_question_counts jsonb,
  p_questions jsonb,
  p_duration_seconds integer
)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select private.create_sdashapi_multi_subject_exam_session(
    p_user_id, p_mode, p_examination, p_exam_year, p_subjects,
    p_subject_question_counts, p_questions, p_duration_seconds
  );
$function$;

revoke all on function public.create_sdashapi_multi_subject_exam_session(
  uuid, text, text, integer, text[], jsonb, jsonb, integer
) from public, anon, authenticated;

grant execute on function public.create_sdashapi_multi_subject_exam_session(
  uuid, text, text, integer, text[], jsonb, jsonb, integer
) to service_role;

commit;
