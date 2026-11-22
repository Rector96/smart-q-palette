
create or replace function public.live_quiz_get_my_answer_internal(
  p_user_id uuid,
  p_room_id uuid,
  p_question_index integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_answer public.quiz_answers%rowtype;
  v_key private.quiz_room_answer_keys%rowtype;
begin
  if not exists (
    select 1 from public.quiz_participants
    where room_id=p_room_id and user_id=p_user_id
  ) then
    raise exception 'NOT_A_PARTICIPANT';
  end if;

  select * into v_answer from public.quiz_answers
  where room_id=p_room_id and user_id=p_user_id and question_index=p_question_index;
  if not found then return null; end if;

  select * into v_key from private.quiz_room_answer_keys
  where room_id=p_room_id and question_index=p_question_index;

  return jsonb_build_object(
    'question_index',v_answer.question_index,
    'selected_option',v_answer.selected_option,
    'time_taken',v_answer.time_taken,
    'is_correct',v_answer.is_correct,
    'points_awarded',v_answer.points_awarded,
    'correct_answer',v_key.correct_answer,
    'explanation',v_key.explanation,
    'exam_hint',v_key.exam_hint,
    'answered_at',v_answer.answered_at
  );
end;
$$;

revoke all on function public.live_quiz_get_my_answer_internal(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.live_quiz_get_my_answer_internal(uuid,uuid,integer) to service_role;
