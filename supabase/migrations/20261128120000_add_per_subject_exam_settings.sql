alter table public.exam_sessions
  add column if not exists allowed_duration_seconds integer not null default 3600
    check (allowed_duration_seconds between 60 and 86400),
  add column if not exists subject_question_counts jsonb not null default '{}'::jsonb;

create or replace function public.create_cbt_exam_session_with_settings(
  p_user_id uuid,
  p_mode text,
  p_subjects text[],
  p_examination text,
  p_exam_year integer,
  p_question_map jsonb,
  p_subject_question_counts jsonb,
  p_allowed_duration_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_session_id uuid;
  v_total integer := 0;
  v_subject text;
  v_count integer;
begin
  if p_subjects is null
    or cardinality(p_subjects) < 1
    or cardinality(p_subjects) > 12
    or array_position(p_subjects, null) is not null
    or p_allowed_duration_seconds is null
    or p_allowed_duration_seconds < 60
    or p_allowed_duration_seconds > 86400
  then
    raise exception 'Invalid exam settings' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_subjects) as selected(subject)
    where btrim(selected.subject) = ''
  ) then
    raise exception 'Invalid exam subject' using errcode = '22023';
  end if;

  if cardinality(p_subjects) <> (
    select count(distinct selected.subject)
    from unnest(p_subjects) as selected(subject)
  ) then
    raise exception 'Duplicate exam subjects are not allowed' using errcode = '22023';
  end if;

  if jsonb_typeof(p_subject_question_counts) is distinct from 'object' then
    raise exception 'Invalid subject question counts' using errcode = '22023';
  end if;

  if (
    select count(*)
    from jsonb_object_keys(p_subject_question_counts)
  ) <> cardinality(p_subjects) then
    raise exception 'Question counts must match the selected subjects' using errcode = '22023';
  end if;

  foreach v_subject in array p_subjects loop
    if not (p_subject_question_counts ? v_subject)
      or coalesce(p_subject_question_counts->>v_subject, '') !~ '^[0-9]{1,2}$'
    then
      raise exception 'Invalid question count for selected subject'
        using errcode = '22023';
    end if;

    v_count := (p_subject_question_counts->>v_subject)::integer;

    if v_count < 1 or v_count > 60 then
      raise exception 'Each subject must contain between 1 and 60 questions'
        using errcode = '22023';
    end if;

    v_total := v_total + v_count;
  end loop;

  if v_total < 1 or v_total > 720 then
    raise exception 'Invalid total question count' using errcode = '22023';
  end if;

  if jsonb_typeof(p_question_map) is distinct from 'array' then
    raise exception 'Invalid exam question set' using errcode = '22023';
  end if;

  if jsonb_array_length(p_question_map) <> v_total then
    raise exception 'Question allocation does not match the exam question set'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_subjects) as selected(subject)
    left join (
      select
        question.subject,
        count(*) as question_count
      from jsonb_to_recordset(p_question_map) as mapping(
        question_id uuid
      )
      join public.questions question
        on question.id = mapping.question_id
      group by question.subject
    ) actual
      on actual.subject = selected.subject
    where coalesce(actual.question_count, 0)
      <> (p_subject_question_counts->>selected.subject)::integer
  ) then
    raise exception 'Question allocation does not match the selected subjects'
      using errcode = '22023';
  end if;

  v_result := public.create_cbt_exam_session(
    p_user_id,
    p_mode,
    p_subjects,
    p_examination,
    p_exam_year,
    p_question_map
  );

  if v_result ? 'error' then
    return v_result;
  end if;

  v_session_id := (v_result->'session'->>'id')::uuid;

  update public.exam_sessions
  set
    allowed_duration_seconds = p_allowed_duration_seconds,
    subject_question_counts = p_subject_question_counts
  where id = v_session_id
    and user_id = p_user_id;

  if not found then
    raise exception 'Could not save exam settings' using errcode = 'P0002';
  end if;

  return jsonb_set(
    v_result,
    '{session}',
    (v_result->'session') || jsonb_build_object(
      'allowed_duration_seconds', p_allowed_duration_seconds,
      'subject_question_counts', p_subject_question_counts
    )
  );
end;
$function$;

revoke all on function public.create_cbt_exam_session_with_settings(uuid, text, text[], text, integer, jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function public.create_cbt_exam_session_with_settings(uuid, text, text[], text, integer, jsonb, jsonb, integer) to service_role;
