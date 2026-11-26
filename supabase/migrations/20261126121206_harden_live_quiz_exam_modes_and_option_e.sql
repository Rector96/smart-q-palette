-- ROCKCBT Live Quiz: examination modes and option E support.
-- Additive migration. Does not change the main CBT exam flow.

alter table public.quiz_rooms
  add column if not exists quiz_type text not null default 'general',
  add column if not exists examination text,
  add column if not exists exam_year integer;

alter table public.quiz_rooms
  drop constraint if exists quiz_rooms_quiz_type_check;

alter table public.quiz_rooms
  add constraint quiz_rooms_quiz_type_check
  check (quiz_type in ('examination', 'general'));

alter table public.quiz_rooms
  drop constraint if exists quiz_rooms_exam_metadata_check;

alter table public.quiz_rooms
  add constraint quiz_rooms_exam_metadata_check
  check (
    (quiz_type = 'general' and examination is null and exam_year is null)
    or
    (quiz_type = 'examination'
      and examination is not null
      and examination in ('JAMB', 'WAEC', 'NECO')
      and exam_year is not null
      and exam_year between 1980 and 2100)
  );

alter table public.quiz_answers
  drop constraint if exists quiz_answers_selected_option_check;

alter table public.quiz_answers
  add constraint quiz_answers_selected_option_check
  check (selected_option is null or selected_option in ('A','B','C','D','E'));

alter table private.quiz_room_answer_keys
  drop constraint if exists quiz_room_answer_keys_correct_answer_check;

alter table private.quiz_room_answer_keys
  add constraint quiz_room_answer_keys_correct_answer_check
  check (correct_answer in ('A','B','C','D','E'));


-- Replace the room creation RPC with examination metadata support.
create or replace function public.live_quiz_create_room_internal(
  p_user_id uuid,
  p_subject text,
  p_game_mode text,
  p_time_per_question integer,
  p_questions jsonb,
  p_answer_keys jsonb,
  p_display_name text,
  p_quiz_type text,
  p_examination text,
  p_exam_year integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile record;
  v_room_id uuid;
  v_room_code text;
  v_question_count integer;
  v_item jsonb;
  v_question jsonb;
  v_index integer;
  v_answer text;
begin
  if p_user_id is null or nullif(trim(p_subject), '') is null then
    raise exception 'Invalid room details';
  end if;

  if p_game_mode not in ('group','duel')
     or p_time_per_question not between 5 and 300 then
    raise exception 'Invalid quiz settings';
  end if;

  if p_quiz_type not in ('examination','general') then
    raise exception 'Invalid quiz type';
  end if;

  if p_quiz_type = 'examination' then
    if p_examination not in ('JAMB','WAEC','NECO')
       or p_exam_year is null
       or p_exam_year < 1980
       or p_exam_year > extract(year from current_date)::integer then
      raise exception 'Invalid examination details';
    end if;
  elsif p_examination is not null or p_exam_year is not null then
    raise exception 'General quizzes cannot contain examination metadata';
  end if;

  if jsonb_typeof(p_questions) <> 'array'
     or jsonb_typeof(p_answer_keys) <> 'array' then
    raise exception 'Invalid question payload';
  end if;

  v_question_count := jsonb_array_length(p_questions);

  if v_question_count < 1 or v_question_count > 100
     or jsonb_array_length(p_answer_keys) <> v_question_count then
    raise exception 'Invalid question count';
  end if;

  -- Require one correctly indexed private answer key per public question.
  for v_index in 0..v_question_count - 1 loop
    v_question := p_questions -> v_index;
    v_item := p_answer_keys -> v_index;

    if jsonb_typeof(v_question) <> 'object'
       or jsonb_typeof(v_item) <> 'object'
       or (v_item->>'question_index') is null
       or (v_item->>'question_index') !~ '^[0-9]+$'
       or (v_item->>'question_index')::integer <> v_index then
      raise exception 'Invalid question or answer-key index';
    end if;

    v_answer := upper(coalesce(v_item->>'correct_answer',''));

    if v_answer not in ('A','B','C','D','E') then
      raise exception 'Invalid correct answer';
    end if;

    if nullif(trim(v_question->>('option_' || lower(v_answer))), '') is null then
      raise exception 'Correct answer option is missing from question';
    end if;
  end loop;

  select is_subscribed, free_live_quiz_used
    into v_profile
    from public.profiles
    where user_id = p_user_id
    for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if not coalesce(v_profile.is_subscribed, false) then
    if coalesce(v_profile.free_live_quiz_used, 0) >= 2 then
      raise exception 'LIVE_QUIZ_LIMIT_REACHED';
    end if;

    update public.profiles
      set free_live_quiz_used = coalesce(free_live_quiz_used,0) + 1
      where user_id = p_user_id;
  end if;

  loop
    v_room_code := (case when p_game_mode = 'duel' then 'D' else '' end)
      || (floor(random() * 9000)::integer + 1000)::text;

    exit when not exists (
      select 1 from public.quiz_rooms r where r.room_code = v_room_code
    );
  end loop;

  insert into public.quiz_rooms
    (host_id, subject, game_mode, num_questions, time_per_question,
     room_code, questions, expires_at, quiz_type, examination, exam_year)
  values
    (p_user_id, trim(p_subject), p_game_mode, v_question_count,
     p_time_per_question, v_room_code, p_questions,
     now() + interval '2 hours', p_quiz_type,
     case when p_quiz_type = 'examination' then p_examination else null end,
     case when p_quiz_type = 'examination' then p_exam_year else null end)
  returning id into v_room_id;

  for v_item in select value from jsonb_array_elements(p_answer_keys)
  loop
    insert into private.quiz_room_answer_keys
      (room_id, question_index, correct_answer, explanation, exam_hint)
    values (
      v_room_id,
      (v_item->>'question_index')::integer,
      upper(v_item->>'correct_answer'),
      nullif(v_item->>'explanation',''),
      nullif(v_item->>'exam_hint','')
    );
  end loop;

  insert into public.quiz_participants(room_id,user_id,display_name)
  values (
    v_room_id,
    p_user_id,
    coalesce(nullif(trim(p_display_name),''),'Host')
  );

  return jsonb_build_object(
    'id',v_room_id,
    'room_code',v_room_code,
    'status','waiting'
  );
end;
$$;


-- Replace answer submission while preserving existing scoring and timing.
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

  select * into v_existing
  from public.quiz_answers
  where room_id=p_room_id
    and user_id=p_user_id
    and question_index=p_question_index;

  if found then
    select * into v_key
    from private.quiz_room_answer_keys
    where room_id=p_room_id and question_index=p_question_index;

    return jsonb_build_object(
      'already_answered',true,
      'is_correct',v_existing.is_correct,
      'points',v_existing.points_awarded,
      'correct_answer',v_key.correct_answer,
      'explanation',v_key.explanation,
      'exam_hint',v_key.exam_hint
    );
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

  -- E is valid only when this question actually contains option E.
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

  return jsonb_build_object(
    'already_answered',false,
    'is_correct',v_correct,
    'points',v_points,
    'correct_answer',v_key.correct_answer,
    'explanation',v_key.explanation,
    'exam_hint',v_key.exam_hint,
    'time_taken',least(v_elapsed,v_room.time_per_question)
  );
end;
$$;


-- Keep the old signature unavailable and grant only the new RPC to service_role.
revoke all on function public.live_quiz_create_room_internal(
  uuid,text,text,integer,jsonb,jsonb,text
) from public, anon, authenticated, service_role;

revoke all on function public.live_quiz_create_room_internal(
  uuid,text,text,integer,jsonb,jsonb,text,text,text,integer
) from public, anon, authenticated;

grant execute on function public.live_quiz_create_room_internal(
  uuid,text,text,integer,jsonb,jsonb,text,text,text,integer
) to service_role;

revoke all on function public.live_quiz_submit_answer_internal(
  uuid,uuid,integer,text
) from public, anon, authenticated;

grant execute on function public.live_quiz_submit_answer_internal(
  uuid,uuid,integer,text
) to service_role;
