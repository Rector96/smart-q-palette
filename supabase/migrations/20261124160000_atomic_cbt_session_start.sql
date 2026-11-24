-- Create the exam session, persist its question/option mapping, and consume
-- the user's trial allowance in one transaction.
create or replace function public.start_cbt_session(
  p_user_id uuid,
  p_mode text,
  p_subjects text[],
  p_total_questions integer,
  p_examination text,
  p_exam_year integer,
  p_questions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.exam_sessions%rowtype;
  v_item jsonb;
  v_question_id uuid;
  v_option_order text[];
  v_position integer;
begin
  if p_user_id is null
     or p_mode not in ('practice', 'cbt', 'mock', 'revision')
     or p_subjects is null
     or cardinality(p_subjects) < 1
     or cardinality(p_subjects) > 12
     or p_examination not in ('JAMB', 'WAEC', 'NECO')
     or (p_exam_year is not null and p_exam_year < 1)
     or jsonb_typeof(p_questions) <> 'array'
     or p_total_questions is null
     or p_total_questions < 1
     or p_total_questions > 720
     or jsonb_array_length(p_questions) <> p_total_questions then
    raise exception 'Invalid exam session payload' using errcode = '22023';
  end if;

  -- Lock and increment the allowance atomically. Concurrent starts for the
  -- same free account serialize on this profile row.
  update public.profiles
  set trial_count = trial_count + 1,
      updated_at = now()
  where user_id = p_user_id
    and (is_subscribed = true or trial_count < 3);
  if not found then
    if exists (select 1 from public.profiles where user_id = p_user_id) then
      raise exception 'TRIAL_LIMIT_REACHED' using errcode = 'P0001';
    end if;
    raise exception 'Student profile not found' using errcode = 'P0002';
  end if;

  insert into public.exam_sessions (
    user_id, mode, subjects, total_questions, examination, exam_year
  )
  values (
    p_user_id, p_mode, p_subjects, p_total_questions, p_examination, p_exam_year
  )
  returning * into v_session;

  for v_item in select value from jsonb_array_elements(p_questions) loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item->>'question_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(v_item->'option_order') <> 'array'
       or coalesce(v_item->>'position', '') !~ '^[0-9]{1,4}$' then
      raise exception 'Invalid exam question mapping' using errcode = '22023';
    end if;

    v_question_id := (v_item->>'question_id')::uuid;
    v_position := (v_item->>'position')::integer;
    select array_agg(value) into v_option_order
    from jsonb_array_elements_text(v_item->'option_order') as option_value(value);

    if v_position < 1 or v_position > p_total_questions
       or cardinality(v_option_order) not in (4, 5)
       or not (v_option_order @> array['A', 'B', 'C', 'D']::text[])
       or not (v_option_order <@ array['A', 'B', 'C', 'D', 'E']::text[])
       or cardinality(array_positions(v_option_order, 'A')) <> 1
       or cardinality(array_positions(v_option_order, 'B')) <> 1
       or cardinality(array_positions(v_option_order, 'C')) <> 1
       or cardinality(array_positions(v_option_order, 'D')) <> 1
       or cardinality(array_positions(v_option_order, 'E')) <> case when cardinality(v_option_order) = 5 then 1 else 0 end then
      raise exception 'Invalid exam option mapping' using errcode = '22023';
    end if;

    insert into public.exam_session_questions (
      session_id, question_id, option_order, position
    )
    values (v_session.id, v_question_id, v_option_order, v_position);
  end loop;

  return jsonb_build_object(
    'id', v_session.id,
    'started_at', v_session.started_at,
    'total_questions', v_session.total_questions
  );
end;
$$;

revoke all on function public.start_cbt_session(uuid, text, text[], integer, text, integer, jsonb)
from public, anon, authenticated;
grant execute on function public.start_cbt_session(uuid, text, text[], integer, text, integer, jsonb)
to service_role;
