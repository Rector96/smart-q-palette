-- Preserve the exact question order used by each submitted exam so result
-- review remains aligned with the original exam, even when rows share a timestamp.
alter table public.user_history
  add column if not exists session_question_position integer;

create unique index if not exists user_history_session_position_unique
  on public.user_history(session_id, session_question_position)
  where session_id is not null and session_question_position is not null;

create or replace function public.submit_cbt_session(p_session_id uuid, p_user_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.exam_sessions%rowtype;
  v_answer jsonb;
  v_question_id uuid;
  v_selected text;
  v_time integer;
  v_option_order text[];
  v_original_answer text;
  v_position integer;
  v_correct boolean;
  v_correct_count integer := 0;
  v_answer_count integer := 0;
  v_details jsonb := '[]'::jsonb;
  v_elapsed integer;
begin
  if p_session_id is null or p_user_id is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Invalid submission payload' using errcode = '22023';
  end if;

  select * into v_session
  from public.exam_sessions
  where id = p_session_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Exam session not found' using errcode = 'P0002';
  end if;
  if v_session.completed then
    raise exception 'This exam has already been submitted' using errcode = '23505';
  end if;
  if jsonb_array_length(p_answers) <> v_session.total_questions then
    raise exception 'Submission must include every question exactly once' using errcode = '22023';
  end if;

  for v_answer in select value from jsonb_array_elements(p_answers) loop
    if v_answer->>'question_id' is null
       or coalesce(v_answer->>'selected_answer','') not in ('A','B','C','D','X')
       or coalesce(v_answer->>'time_spent_seconds','') !~ '^[0-9]{1,6}$' then
      raise exception 'Invalid answer entry' using errcode = '22023';
    end if;

    v_question_id := (v_answer->>'question_id')::uuid;
    v_selected := v_answer->>'selected_answer';
    v_time := (v_answer->>'time_spent_seconds')::integer;
    if v_time > 86400 then
      raise exception 'Invalid answer time' using errcode = '22023';
    end if;

    select esq.option_order, q.correct_answer, esq.position
      into v_option_order, v_original_answer, v_position
    from public.exam_session_questions esq
    join public.questions q on q.id = esq.question_id
    where esq.session_id = p_session_id and esq.question_id = v_question_id;

    if not found then
      raise exception 'Answer contains a question outside this exam' using errcode = '22023';
    end if;

    if exists (
      select 1 from public.user_history uh
      where uh.session_id = p_session_id and uh.question_id = v_question_id
    ) then
      raise exception 'Duplicate question in submission' using errcode = '22023';
    end if;

    if v_selected = 'X' then
      v_correct := false;
    else
      v_correct := v_option_order[array_position(array['A','B','C','D']::text[], v_selected)] = v_original_answer;
    end if;

    if v_correct then
      v_correct_count := v_correct_count + 1;
    end if;
    v_answer_count := v_answer_count + 1;

    insert into public.user_history(
      user_id, question_id, selected_answer, is_correct,
      time_spent_seconds, session_id, session_question_position
    )
    values (
      p_user_id,
      v_question_id,
      case
        when v_selected = 'X' then 'X'
        else v_option_order[array_position(array['A','B','C','D']::text[], v_selected)]
      end,
      v_correct,
      v_time,
      p_session_id,
      v_position
    );

    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'question_id', v_question_id,
      'selected_answer', v_selected,
      'is_correct', v_correct,
      'position', v_position
    ));
  end loop;

  if v_answer_count <> v_session.total_questions then
    raise exception 'Submission does not match exam question count' using errcode = '22023';
  end if;

  v_elapsed := greatest(0, floor(extract(epoch from (now() - v_session.started_at)))::integer);

  update public.exam_sessions
  set correct_answers = v_correct_count,
      score_percentage = case
        when total_questions = 0 then 0
        else round((v_correct_count::numeric / total_questions) * 100, 2)
      end,
      duration_seconds = v_elapsed,
      completed = true,
      completed_at = now()
  where id = p_session_id and user_id = p_user_id;

  insert into public.user_seen_questions(user_id, question_id)
  select p_user_id, esq.question_id
  from public.exam_session_questions esq
  where esq.session_id = p_session_id
  on conflict (user_id, question_id) do update set seen_at = now();

  return jsonb_build_object(
    'session_id', p_session_id,
    'total_questions', v_session.total_questions,
    'correct_answers', v_correct_count,
    'score_percentage', case
      when v_session.total_questions = 0 then 0
      else round((v_correct_count::numeric / v_session.total_questions) * 100, 2)
    end,
    'duration_seconds', v_elapsed,
    'answers', v_details
  );
end;
$$;

revoke all on function public.submit_cbt_session(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.submit_cbt_session(uuid, uuid, jsonb) to service_role;
