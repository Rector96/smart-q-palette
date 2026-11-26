-- Enforce answer reveal rules in both submission and recovery RPCs.

create or replace function public.live_quiz_submit_answer_internal(
  p_user_id uuid,
  p_room_id uuid,
  p_question_index integer,
  p_selected_option text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.quiz_rooms%rowtype;
  v_key private.quiz_room_answer_keys%rowtype;
  v_elapsed integer;
  v_selected text;
  v_correct boolean;
  v_points integer;
  v_existing public.quiz_answers%rowtype;
  v_question jsonb;
  v_reveal boolean;
  v_result jsonb;
begin
  select * into v_room
  from public.quiz_rooms
  where id=p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if v_room.status <> 'live'
     or p_question_index <> v_room.current_question_index
     or p_question_index < 0
     or p_question_index >= v_room.num_questions then
    raise exception 'QUESTION_NOT_ACTIVE';
  end if;

  if not exists (
    select 1 from public.quiz_participants p
    where p.room_id=p_room_id and p.user_id=p_user_id
  ) then
    raise exception 'NOT_A_PARTICIPANT';
  end if;

  v_reveal := v_room.answer_reveal_mode = 'after_question'
    or v_room.status = 'ended';

  select * into v_existing
  from public.quiz_answers
  where room_id=p_room_id
    and user_id=p_user_id
    and question_index=p_question_index;

  if found then
    v_result := jsonb_build_object(
      'already_answered',true,
      'selected_option',v_existing.selected_option,
      'time_taken',v_existing.time_taken
    );

    if v_reveal then
      select * into v_key
      from private.quiz_room_answer_keys
      where room_id=p_room_id and question_index=p_question_index;

      v_result := v_result || jsonb_build_object(
        'is_correct',v_existing.is_correct,
        'points',v_existing.points_awarded,
        'correct_answer',v_key.correct_answer,
        'explanation',v_key.explanation,
        'exam_hint',v_key.exam_hint
      );
    end if;

    return v_result;
  end if;

  v_elapsed := greatest(
    0,
    floor(extract(epoch from (clock_timestamp()-v_room.question_started_at)))::integer
  );

  v_selected := upper(nullif(trim(p_selected_option),''));

  if v_elapsed > v_room.time_per_question then
    v_selected := null;
  end if;

  if v_selected not in ('A','B','C','D','E') then
    v_selected := null;
  end if;

  v_question := v_room.questions -> p_question_index;

  if v_selected = 'E'
     and nullif(trim(v_question->>'option_e'),'') is null then
    v_selected := null;
  end if;

  select * into v_key
  from private.quiz_room_answer_keys
  where room_id=p_room_id and question_index=p_question_index;

  if not found then
    raise exception 'ANSWER_KEY_NOT_FOUND';
  end if;

  v_correct := v_selected is not null
    and v_selected=v_key.correct_answer;

  v_points := case when v_correct then
    10 + greatest(
      0,
      floor(
        (v_room.time_per_question-v_elapsed)::numeric
        / v_room.time_per_question * 5
      )::integer
    )
    else 0
  end;

  insert into public.quiz_answers
    (room_id,user_id,question_index,selected_option,time_taken,is_correct,points_awarded)
  values (
    p_room_id,p_user_id,p_question_index,v_selected,
    least(v_elapsed,v_room.time_per_question),v_correct,v_points
  );

  update public.quiz_participants
    set score=score+v_points
    where room_id=p_room_id and user_id=p_user_id;

  if p_user_id=v_room.host_id and v_room.reveal_until is null then
    update public.quiz_rooms
      set reveal_until=clock_timestamp()+interval '3 seconds',
          updated_at=now()
      where id=p_room_id;
  end if;

  v_result := jsonb_build_object(
    'already_answered',false,
    'selected_option',v_selected,
    'time_taken',least(v_elapsed,v_room.time_per_question)
  );

  if v_reveal then
    v_result := v_result || jsonb_build_object(
      'is_correct',v_correct,
      'points',v_points,
      'correct_answer',v_key.correct_answer,
      'explanation',v_key.explanation,
      'exam_hint',v_key.exam_hint
    );
  end if;

  return v_result;
end;
$$;


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
  v_room public.quiz_rooms%rowtype;
  v_answer public.quiz_answers%rowtype;
  v_key private.quiz_room_answer_keys%rowtype;
  v_reveal boolean;
  v_result jsonb;
begin
  select * into v_room
  from public.quiz_rooms
  where id=p_room_id;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if not exists (
    select 1 from public.quiz_participants
    where room_id=p_room_id and user_id=p_user_id
  ) then
    raise exception 'NOT_A_PARTICIPANT';
  end if;

  select * into v_answer
  from public.quiz_answers
  where room_id=p_room_id
    and user_id=p_user_id
    and question_index=p_question_index;

  if not found then
    return null;
  end if;

  v_reveal := v_room.answer_reveal_mode = 'after_question'
    or v_room.status = 'ended';

  v_result := jsonb_build_object(
    'question_index',v_answer.question_index,
    'selected_option',v_answer.selected_option,
    'time_taken',v_answer.time_taken,
    'answered_at',v_answer.answered_at
  );

  if v_reveal then
    select * into v_key
    from private.quiz_room_answer_keys
    where room_id=p_room_id
      and question_index=p_question_index;

    v_result := v_result || jsonb_build_object(
      'is_correct',v_answer.is_correct,
      'points_awarded',v_answer.points_awarded,
      'correct_answer',v_key.correct_answer,
      'explanation',v_key.explanation,
      'exam_hint',v_key.exam_hint
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.live_quiz_submit_answer_internal(uuid,uuid,integer,text)
  from public, anon, authenticated;
grant execute on function public.live_quiz_submit_answer_internal(uuid,uuid,integer,text)
  to service_role;

revoke all on function public.live_quiz_get_my_answer_internal(uuid,uuid,integer)
  from public, anon, authenticated;
grant execute on function public.live_quiz_get_my_answer_internal(uuid,uuid,integer)
  to service_role;
