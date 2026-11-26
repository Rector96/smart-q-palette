-- Allow the quiz host to participate optionally.
-- The host is not registered as a student unless explicitly enabled.

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
  p_exam_year integer,
  p_host_participates boolean
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
     room_code, questions, expires_at, quiz_type, examination, exam_year,
     host_participates)
  values
    (p_user_id, trim(p_subject), p_game_mode, v_question_count,
     p_time_per_question, v_room_code, p_questions,
     now() + interval '2 hours', p_quiz_type,
     case when p_quiz_type = 'examination' then p_examination else null end,
     case when p_quiz_type = 'examination' then p_exam_year else null end,
     coalesce(p_host_participates, false))
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

  if coalesce(p_host_participates, false) then
    insert into public.quiz_participants(room_id,user_id,display_name)
    values (
      v_room_id,
      p_user_id,
      coalesce(nullif(trim(p_display_name),''),'Host')
    );
  end if;

  return jsonb_build_object(
    'id',v_room_id,
    'room_code',v_room_code,
    'status','waiting',
    'host_participates',coalesce(p_host_participates,false)
  );
end;
$$;

-- Disable the previous signature; only the new signature is callable
-- by the trusted Edge Function service role.
revoke all on function public.live_quiz_create_room_internal(
  uuid,text,text,integer,jsonb,jsonb,text,text,text,integer
) from public, anon, authenticated, service_role;

revoke all on function public.live_quiz_create_room_internal(
  uuid,text,text,integer,jsonb,jsonb,text,text,text,integer,boolean
) from public, anon, authenticated;

grant execute on function public.live_quiz_create_room_internal(
  uuid,text,text,integer,jsonb,jsonb,text,text,text,integer,boolean
) to service_role;
