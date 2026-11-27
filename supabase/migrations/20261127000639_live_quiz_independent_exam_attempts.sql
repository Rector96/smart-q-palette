
-- ROCKCBT Live Quiz: independent examination attempts.
-- Existing general live quiz RPCs remain unchanged.
-- All new RPCs are callable only by the trusted service role.

-- 1. Create an examination room using the existing validated creation
-- function, then apply the overall examination duration.
create or replace function public.live_quiz_create_exam_room_internal(
  p_user_id uuid,
  p_subject text,
  p_time_per_question integer,
  p_questions jsonb,
  p_answer_keys jsonb,
  p_display_name text,
  p_examination text,
  p_exam_year integer,
  p_host_participates boolean,
  p_duration_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_room_id uuid;
begin
 if p_duration_seconds is null
   or p_duration_seconds not between 60 and 86400 then
  raise exception 'INVALID_EXAM_DURATION';
end if;

  v_result := public.live_quiz_create_room_internal(
    p_user_id,
    p_subject,
    'group',
    p_time_per_question,
    p_questions,
    p_answer_keys,
    p_display_name,
    'examination',
    p_examination,
    p_exam_year,
    coalesce(p_host_participates, false)
  );

  v_room_id := (v_result->>'id')::uuid;

  update public.quiz_rooms
  set session_mode = 'live',
      duration_seconds = p_duration_seconds,
      answer_reveal_mode = 'after_quiz',
      updated_at = now()
  where id = v_room_id;

  return v_result || jsonb_build_object(
    'duration_seconds', p_duration_seconds,
    'session_mode', 'live'
  );
end;
$$;


-- 2. Start the examination and create one independent attempt
-- for every registered participant.
create or replace function public.live_quiz_start_exam_internal(
  p_user_id uuid,
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.quiz_rooms%rowtype;
  v_started_at timestamptz := clock_timestamp();
  v_count integer;
begin
  select *
  into v_room
  from public.quiz_rooms
  where id = p_room_id
  for update;

  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.host_id <> p_user_id then raise exception 'HOST_ONLY'; end if;
  if v_room.status <> 'waiting' then raise exception 'ROOM_NOT_WAITING'; end if;
  if v_room.quiz_type <> 'examination' then
    raise exception 'NOT_AN_EXAMINATION';
  end if;

  select count(*)
  into v_count
  from public.quiz_participants
  where room_id = p_room_id;

  if v_count < 1 then raise exception 'NO_PARTICIPANTS'; end if;

  insert into public.quiz_attempts (
    room_id,
    user_id,
    is_host_attempt,
    status,
    current_question_index,
    duration_seconds,
    started_at,
    deadline_at,
    total_questions
  )
  select
    p_room_id,
    p.user_id,
    p.user_id = v_room.host_id,
    'in_progress',
    0,
    v_room.duration_seconds,
    v_started_at,
    v_started_at + make_interval(secs => v_room.duration_seconds),
    v_room.num_questions
  from public.quiz_participants p
  where p.room_id = p_room_id
  on conflict (room_id, user_id) do nothing;

  update public.quiz_rooms
  set status = 'live',
      current_question_index = 0,
      started_at = v_started_at,
      ended_at = null,
      is_locked = false,
      updated_at = now()
  where id = p_room_id;

  return jsonb_build_object(
    'status', 'live',
    'started_at', v_started_at,
    'duration_seconds', v_room.duration_seconds,
    'participant_count', v_count
  );
end;
$$;


-- 3. Finish an individual attempt. This operation is idempotent.
-- Correct answers are calculated from the private answer-key table.
create or replace function public.live_quiz_finish_exam_attempt_internal(
  p_user_id uuid,
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.quiz_attempts%rowtype;
  v_score integer;
  v_expired boolean;
  v_completed integer;
  v_total integer;
begin
  select *
  into v_attempt
  from public.quiz_attempts
  where room_id = p_room_id
    and user_id = p_user_id
  for update;

  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;

  if v_attempt.status in ('submitted', 'expired') then
    return jsonb_build_object(
      'status', v_attempt.status,
      'score', v_attempt.score,
      'total_questions', v_attempt.total_questions,
      'already_finished', true
    );
  end if;

  v_expired := v_attempt.deadline_at <= clock_timestamp();

  select coalesce(sum(points_awarded), 0)::integer
  into v_score
  from public.quiz_attempt_answers
  where attempt_id = v_attempt.id;

  update public.quiz_attempts
  set status = case when v_expired then 'expired' else 'submitted' end,
      score = v_score,
      submitted_at = clock_timestamp(),
      updated_at = now()
  where id = v_attempt.id;

  select count(*)
  into v_completed
  from public.quiz_attempts
  where room_id = p_room_id
    and status in ('submitted', 'expired');

  select count(*)
  into v_total
  from public.quiz_attempts
  where room_id = p_room_id;

  if v_total > 0 and v_completed >= v_total then
    update public.quiz_rooms
    set status = 'ended',
        ended_at = clock_timestamp(),
        is_locked = true,
        updated_at = now()
    where id = p_room_id;
  end if;

  return jsonb_build_object(
    'status', case when v_expired then 'expired' else 'submitted' end,
    'score', v_score,
    'total_questions', v_attempt.total_questions,
    'already_finished', false
  );
end;
$$;


-- 4. Save or update one answer for the authenticated participant.
-- The correct answer is never returned while the attempt is active.
create or replace function public.live_quiz_submit_exam_answer_internal(
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
  v_attempt public.quiz_attempts%rowtype;
  v_room public.quiz_rooms%rowtype;
  v_correct_answer text;
  v_selected text;
  v_correct boolean;
begin
  select *
  into v_room
  from public.quiz_rooms
  where id = p_room_id;

  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'live' then raise exception 'ROOM_NOT_LIVE'; end if;

  select *
  into v_attempt
  from public.quiz_attempts
  where room_id = p_room_id
    and user_id = p_user_id
  for update;

  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;

  if v_attempt.status <> 'in_progress' then
    raise exception 'ATTEMPT_NOT_ACTIVE';
  end if;

  if v_attempt.deadline_at <= clock_timestamp() then
    perform public.live_quiz_finish_exam_attempt_internal(
      p_user_id, p_room_id
    );

    return jsonb_build_object('status', 'expired');
  end if;

  if p_question_index < 0
     or p_question_index >= v_attempt.total_questions then
    raise exception 'INVALID_QUESTION_INDEX';
  end if;

  v_selected := upper(nullif(trim(p_selected_option), ''));

  if v_selected is not null
     and v_selected not in ('A', 'B', 'C', 'D', 'E') then
    raise exception 'INVALID_SELECTED_OPTION';
  end if;

  select upper(correct_answer)
  into v_correct_answer
  from private.quiz_room_answer_keys
  where room_id = p_room_id
    and question_index = p_question_index;

  if not found then raise exception 'ANSWER_KEY_NOT_FOUND'; end if;

  v_correct := v_selected is not null
    and v_selected = v_correct_answer;

  insert into public.quiz_attempt_answers (
    attempt_id,
    room_id,
    user_id,
    question_index,
    selected_option,
    is_correct,
    points_awarded,
    time_taken,
    answered_at
  )
  values (
    v_attempt.id,
    p_room_id,
    p_user_id,
    p_question_index,
    v_selected,
    v_correct,
    case when v_correct then 1 else 0 end,
    greatest(
      0,
      floor(extract(epoch from (
        clock_timestamp() - v_attempt.started_at
      )))::integer
    ),
    clock_timestamp()
  )
  on conflict (attempt_id, question_index)
  do update set
    selected_option = excluded.selected_option,
    is_correct = excluded.is_correct,
    points_awarded = excluded.points_awarded,
    time_taken = excluded.time_taken,
    answered_at = excluded.answered_at;

  update public.quiz_attempts
  set current_question_index = p_question_index,
      updated_at = now()
  where id = v_attempt.id;

  return jsonb_build_object(
    'status', 'saved',
    'question_index', p_question_index,
    'selected_option', v_selected
  );
end;
$$;


-- 5. Persist independent question navigation.
create or replace function public.live_quiz_set_exam_progress_internal(
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
  v_attempt public.quiz_attempts%rowtype;
begin
  select *
  into v_attempt
  from public.quiz_attempts
  where room_id = p_room_id
    and user_id = p_user_id
  for update;

  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;

  if v_attempt.status <> 'in_progress' then
    raise exception 'ATTEMPT_NOT_ACTIVE';
  end if;

  if v_attempt.deadline_at <= clock_timestamp() then
    perform public.live_quiz_finish_exam_attempt_internal(
      p_user_id, p_room_id
    );

    return jsonb_build_object('status', 'expired');
  end if;

  if p_question_index < 0
     or p_question_index >= v_attempt.total_questions then
    raise exception 'INVALID_QUESTION_INDEX';
  end if;

  update public.quiz_attempts
  set current_question_index = p_question_index,
      updated_at = now()
  where id = v_attempt.id;

  return jsonb_build_object(
    'status', 'saved',
    'current_question_index', p_question_index
  );
end;
$$;


-- 6. Recover only the current participant's attempt and answers.
-- The private answer key and correctness values are not returned.
create or replace function public.live_quiz_get_my_exam_attempt_internal(
  p_user_id uuid,
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.quiz_attempts%rowtype;
  v_answers jsonb;
begin
  select *
  into v_attempt
  from public.quiz_attempts
  where room_id = p_room_id
    and user_id = p_user_id
  for update;

  if not found then
    return null;
  end if;

  if v_attempt.status = 'in_progress'
     and v_attempt.deadline_at <= clock_timestamp() then
    perform public.live_quiz_finish_exam_attempt_internal(
      p_user_id, p_room_id
    );

    select *
    into v_attempt
    from public.quiz_attempts
    where room_id = p_room_id
      and user_id = p_user_id;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'question_index', a.question_index,
        'selected_option', a.selected_option,
        'answered_at', a.answered_at,
        'is_flagged', a.is_flagged
      )
      order by a.question_index
    ),
    '[]'::jsonb
  )
  into v_answers
  from public.quiz_attempt_answers a
  where a.attempt_id = v_attempt.id;

  return jsonb_build_object(
    'attempt', jsonb_build_object(
      'id', v_attempt.id,
      'status', v_attempt.status,
      'current_question_index', v_attempt.current_question_index,
      'started_at', v_attempt.started_at,
      'deadline_at', v_attempt.deadline_at,
      'submitted_at', v_attempt.submitted_at,
      'score', v_attempt.score,
      'total_questions', v_attempt.total_questions
    ),
    'answers', v_answers
  );
end;
$$;


-- 7. Restrict every new function to the trusted Edge Function role.
revoke all on function public.live_quiz_create_exam_room_internal(
  uuid,text,integer,jsonb,jsonb,text,text,integer,boolean,integer
) from public, anon, authenticated;

revoke all on function public.live_quiz_start_exam_internal(uuid,uuid)
  from public, anon, authenticated;

revoke all on function public.live_quiz_finish_exam_attempt_internal(uuid,uuid)
  from public, anon, authenticated;

revoke all on function public.live_quiz_submit_exam_answer_internal(
  uuid,uuid,integer,text
) from public, anon, authenticated;

revoke all on function public.live_quiz_set_exam_progress_internal(
  uuid,uuid,integer
) from public, anon, authenticated;

revoke all on function public.live_quiz_get_my_exam_attempt_internal(uuid,uuid)
  from public, anon, authenticated;

grant execute on function public.live_quiz_create_exam_room_internal(
  uuid,text,integer,jsonb,jsonb,text,text,integer,boolean,integer
) to service_role;

grant execute on function public.live_quiz_start_exam_internal(uuid,uuid)
  to service_role;

grant execute on function public.live_quiz_finish_exam_attempt_internal(uuid,uuid)
  to service_role;

grant execute on function public.live_quiz_submit_exam_answer_internal(
  uuid,uuid,integer,text
) to service_role;

grant execute on function public.live_quiz_set_exam_progress_internal(
  uuid,uuid,integer
) to service_role;

grant execute on function public.live_quiz_get_my_exam_attempt_internal(uuid,uuid)
  to service_role;
-- Prevent late participants from entering an examination already in progress.
create or replace function public.live_quiz_block_late_exam_join()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quiz_type text;
  v_status text;
begin
select quiz_type, status
into v_quiz_type, v_status
from public.quiz_rooms
where id = new.room_id
for update;



  if v_quiz_type = 'examination'
     and v_status <> 'waiting' then
    raise exception 'EXAM_ALREADY_STARTED';
  end if;

  return new;
end;
$$;

revoke all on function public.live_quiz_block_late_exam_join()
from public, anon, authenticated;

drop trigger if exists block_late_exam_participants
on public.quiz_participants;

create trigger block_late_exam_participants
before insert on public.quiz_participants
for each row
execute function public.live_quiz_block_late_exam_join();