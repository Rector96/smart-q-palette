begin;

-- Replace the feedback lookup with an answer-recording operation. A practice
-- answer must be supplied and stored before the private answer key is returned.
drop function if exists public.get_sdashapi_practice_feedback(uuid, uuid, integer);
drop function if exists private.get_sdashapi_practice_feedback(uuid, uuid, integer);

create function private.get_sdashapi_practice_feedback(
  p_session_id uuid,
  p_user_id uuid,
  p_position integer,
  p_selected_answer text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.sdashapi_exam_sessions%rowtype;
  v_feedback jsonb;
  v_selected_answer text := upper(btrim(coalesce(p_selected_answer, '')));
begin
  if p_session_id is null or p_user_id is null
     or p_position is null or p_position < 1 or p_position > 200
     or v_selected_answer not in ('A', 'B', 'C', 'D', 'E') then
    raise exception 'Invalid practice feedback request';
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

  if v_session.exam_mode <> 'practice' or v_session.status <> 'in_progress' then
    raise exception 'Practice feedback is unavailable for this session';
  end if;

  -- Persist the student's selected option before exposing the answer key.
  insert into public.sdashapi_attempt_answers (
    session_id, question_position, selected_answer, time_spent_seconds, is_correct
  )
  select
    p_session_id,
    p_position,
    v_selected_answer,
    0,
    v_selected_answer = k.correct_answer
  from private.sdashapi_answer_keys k
  where k.session_id = p_session_id
    and k.question_position = p_position
  on conflict (session_id, question_position)
  do update set
    selected_answer = excluded.selected_answer,
    is_correct = excluded.is_correct;

  if not found then
    raise exception 'Question not found';
  end if;

  select jsonb_build_object(
    'position', q.position,
    'subject', q.subject,
    'selected_answer', a.selected_answer,
    'correct_answer', k.correct_answer,
    'is_correct', a.is_correct,
    'solution', k.solution
  )
  into v_feedback
  from public.sdashapi_session_questions q
  join private.sdashapi_answer_keys k
    on k.session_id = q.session_id
   and k.question_position = q.position
  join public.sdashapi_attempt_answers a
    on a.session_id = q.session_id
   and a.question_position = q.position
  where q.session_id = p_session_id
    and q.position = p_position;

  if v_feedback is null then
    raise exception 'Question not found';
  end if;

  return jsonb_build_object('ok', true, 'feedback', v_feedback);
end;
$function$;

revoke all on function private.get_sdashapi_practice_feedback(uuid, uuid, integer, text)
  from public, anon, authenticated;
grant execute on function private.get_sdashapi_practice_feedback(uuid, uuid, integer, text)
  to service_role;

create function public.get_sdashapi_practice_feedback(
  p_session_id uuid,
  p_user_id uuid,
  p_position integer,
  p_selected_answer text
)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select private.get_sdashapi_practice_feedback(
    p_session_id, p_user_id, p_position, p_selected_answer
  );
$function$;

revoke all on function public.get_sdashapi_practice_feedback(uuid, uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.get_sdashapi_practice_feedback(uuid, uuid, integer, text)
  to service_role;

commit;
