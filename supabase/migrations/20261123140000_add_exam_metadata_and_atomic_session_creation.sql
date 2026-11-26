alter table public.questions
  add column if not exists examination text,
  add column if not exists is_published boolean not null default true;

alter table public.questions
  alter column examination set default 'JAMB',
  alter column is_published set default true;

update public.questions
set is_published = true
where is_published is null;

alter table public.questions
  alter column is_published set not null;

alter table public.exam_sessions
  add column if not exists examination text,
  add column if not exists exam_year integer;

alter table public.shared_exams
  add column if not exists examination text,
  add column if not exists exam_year integer;

create index if not exists questions_published_exam_subject_year_idx
  on public.questions (examination, subject, year)
  where is_published = true;

create or replace function public.get_seen_cbt_question_ids(
  p_user_id uuid,
  p_question_ids uuid[]
)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(seen.question_id), array[]::uuid[])
  from public.user_seen_questions seen
  where seen.user_id = p_user_id
    and seen.question_id = any(coalesce(p_question_ids, array[]::uuid[]));
$$;

revoke all on function public.get_seen_cbt_question_ids(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.get_seen_cbt_question_ids(uuid, uuid[]) to service_role;

create or replace function public.create_cbt_exam_session(
  p_user_id uuid,
  p_mode text,
  p_subjects text[],
  p_examination text,
  p_exam_year integer,
  p_question_map jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_question_count integer;
  v_trial_result jsonb;
  v_session_id uuid;
  v_started_at timestamptz;
  v_inserted_count integer;
begin
  if p_user_id is null
    or coalesce(p_mode, '') not in ('practice', 'cbt', 'mock', 'revision')
    or coalesce(cardinality(p_subjects), 0) not between 1 and 12
    or coalesce(p_examination, '') not in ('JAMB', 'WAEC', 'NECO')
    or (p_mode = 'mock' and p_examination <> 'JAMB')
    or coalesce(jsonb_typeof(p_question_map), '') <> 'array' then
    raise exception 'Invalid exam session payload' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_subjects) as selected_subject(subject)
    where nullif(btrim(selected_subject.subject), '') is null
  ) then
    raise exception 'Invalid exam subject' using errcode = '22023';
  end if;

  v_question_count := jsonb_array_length(p_question_map);
  if v_question_count < 1 or v_question_count > 720 then
    raise exception 'Invalid exam question count' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_question_map) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or not (item.value ?& array['question_id', 'option_order', 'position'])
      or coalesce(jsonb_typeof(item.value->'question_id'), '') <> 'string'
      or coalesce(jsonb_typeof(item.value->'option_order'), '') <> 'array'
      or coalesce(jsonb_typeof(item.value->'position'), '') <> 'number'
  ) then
    raise exception 'Invalid exam question mapping' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_question_map) as mapping(
      question_id uuid,
      option_order text[],
      position integer
    )
    where mapping.question_id is null
      or mapping.position is null
      or mapping.position < 1
      or mapping.position > v_question_count
      or cardinality(mapping.option_order) not in (4, 5)
      or not (mapping.option_order <@ array['A', 'B', 'C', 'D', 'E']::text[])
      or not (array['A', 'B', 'C', 'D']::text[] <@ mapping.option_order)
      or (cardinality(mapping.option_order) = 5 and not ('E' = any(mapping.option_order)))
  ) then
    raise exception 'Invalid exam question mapping' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_question_map) as mapping(
      question_id uuid,
      option_order text[],
      position integer
    )
    left join public.questions question on question.id = mapping.question_id
    where question.id is null
      or question.is_published is not true
      or question.examination is distinct from p_examination
      or not (question.subject = any(p_subjects))
      or (p_exam_year is not null and question.year is distinct from p_exam_year)
  ) then
    raise exception 'Exam contains unavailable questions' using errcode = '22023';
  end if;

  v_trial_result := public.consume_cbt_trial(p_user_id);
  if v_trial_result->>'allowed' is distinct from 'true' then
    return jsonb_build_object('error', 'TRIAL_LIMIT_REACHED');
  end if;

  insert into public.exam_sessions (
    user_id,
    mode,
    subjects,
    total_questions,
    examination,
    exam_year
  )
  values (
    p_user_id,
    p_mode,
    p_subjects,
    v_question_count,
    p_examination,
    p_exam_year
  )
  returning id, started_at into v_session_id, v_started_at;

  insert into public.exam_session_questions (
    session_id,
    question_id,
    option_order,
    position
  )
  select
    v_session_id,
    mapping.question_id,
    mapping.option_order,
    mapping.position
  from jsonb_to_recordset(p_question_map) as mapping(
    question_id uuid,
    option_order text[],
    position integer
  );
  get diagnostics v_inserted_count = row_count;

  if v_inserted_count <> v_question_count then
    raise exception 'Exam question mapping was incomplete' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'session',
    jsonb_build_object(
      'id', v_session_id,
      'started_at', v_started_at,
      'total_questions', v_question_count
    )
  );
end;
$$;

revoke all on function public.create_cbt_exam_session(uuid, text, text[], text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.create_cbt_exam_session(uuid, text, text[], text, integer, jsonb) to service_role;
