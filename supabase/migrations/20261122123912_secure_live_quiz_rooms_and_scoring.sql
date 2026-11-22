
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

alter table public.profiles
  add column if not exists free_live_quiz_used integer not null default 0;

create table public.quiz_rooms (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  game_mode text not null check (game_mode in ('group','duel')),
  num_questions integer not null check (num_questions between 1 and 100),
  time_per_question integer not null check (time_per_question between 5 and 300),
  room_code text not null unique,
  status text not null default 'waiting' check (status in ('waiting','live','ended')),
  current_question_index integer not null default 0 check (current_question_index >= 0),
  questions jsonb not null default '[]'::jsonb,
  question_started_at timestamptz,
  reveal_until timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quiz_rooms_questions_array check (jsonb_typeof(questions) = 'array')
);

create table public.quiz_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.quiz_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'Player',
  score integer not null default 0 check (score >= 0),
  is_connected boolean not null default true,
  joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.quiz_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_index integer not null check (question_index >= 0),
  selected_option text check (selected_option is null or selected_option in ('A','B','C','D')),
  time_taken integer not null default 0 check (time_taken >= 0),
  is_correct boolean not null default false,
  points_awarded integer not null default 0 check (points_awarded >= 0),
  answered_at timestamptz not null default now(),
  unique (room_id, user_id, question_index)
);

create table private.quiz_room_answer_keys (
  room_id uuid not null references public.quiz_rooms(id) on delete cascade,
  question_index integer not null check (question_index >= 0),
  correct_answer text not null check (correct_answer in ('A','B','C','D')),
  explanation text,
  exam_hint text,
  primary key (room_id, question_index)
);

create index quiz_rooms_code_idx on public.quiz_rooms(room_code);
create index quiz_rooms_host_idx on public.quiz_rooms(host_id);
create index quiz_participants_room_idx on public.quiz_participants(room_id);
create index quiz_answers_room_idx on public.quiz_answers(room_id);
create index quiz_answers_user_idx on public.quiz_answers(user_id);

alter table public.quiz_rooms enable row level security;
alter table public.quiz_participants enable row level security;
alter table public.quiz_answers enable row level security;
alter table private.quiz_room_answer_keys enable row level security;

create or replace function private.is_live_quiz_member(p_room_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
    from public.quiz_participants p
    where p.room_id = p_room_id and p.user_id = p_user_id
  );
$$;

revoke all on function private.is_live_quiz_member(uuid,uuid) from public, anon;
grant execute on function private.is_live_quiz_member(uuid,uuid) to authenticated, service_role;

create policy "Live quiz members can read their room"
on public.quiz_rooms for select to authenticated
using (private.is_live_quiz_member(id, (select auth.uid())));

create policy "Live quiz members can read room participants"
on public.quiz_participants for select to authenticated
using (private.is_live_quiz_member(room_id, (select auth.uid())));

create policy "Players can read only their own submitted answers"
on public.quiz_answers for select to authenticated
using (user_id = (select auth.uid()));

revoke all on public.quiz_rooms, public.quiz_participants, public.quiz_answers from anon, authenticated;
grant select on public.quiz_rooms, public.quiz_participants, public.quiz_answers to authenticated;
grant all on public.quiz_rooms, public.quiz_participants, public.quiz_answers to service_role;
revoke all on private.quiz_room_answer_keys from public, anon, authenticated, service_role;
grant all on private.quiz_room_answer_keys to service_role;

create or replace function public.live_quiz_create_room_internal(
  p_user_id uuid,
  p_subject text,
  p_game_mode text,
  p_time_per_question integer,
  p_questions jsonb,
  p_answer_keys jsonb,
  p_display_name text
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
begin
  if p_user_id is null or nullif(trim(p_subject), '') is null then
    raise exception 'Invalid room details';
  end if;
  if p_game_mode not in ('group','duel') or p_time_per_question not between 5 and 300 then
    raise exception 'Invalid quiz settings';
  end if;
  if jsonb_typeof(p_questions) <> 'array' or jsonb_typeof(p_answer_keys) <> 'array' then
    raise exception 'Invalid question payload';
  end if;
  v_question_count := jsonb_array_length(p_questions);
  if v_question_count < 1 or v_question_count > 100
     or jsonb_array_length(p_answer_keys) <> v_question_count then
    raise exception 'Invalid question count';
  end if;

  select is_subscribed, free_live_quiz_used
    into v_profile
    from public.profiles
    where user_id = p_user_id
    for update;
  if not found then raise exception 'Profile not found'; end if;
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
    exit when not exists (select 1 from public.quiz_rooms r where r.room_code = v_room_code);
  end loop;

  insert into public.quiz_rooms
    (host_id, subject, game_mode, num_questions, time_per_question, room_code, questions, expires_at)
  values
    (p_user_id, trim(p_subject), p_game_mode, v_question_count, p_time_per_question,
     v_room_code, p_questions, now() + interval '2 hours')
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
  values (v_room_id,p_user_id,coalesce(nullif(trim(p_display_name),''),'Host'));

  return jsonb_build_object('id',v_room_id,'room_code',v_room_code,'status','waiting');
end;
$$;

create or replace function public.live_quiz_join_room_internal(
  p_user_id uuid,
  p_room_code text,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.quiz_rooms%rowtype;
  v_profile record;
  v_existing boolean;
  v_count integer;
begin
  select * into v_room
  from public.quiz_rooms
  where room_code = upper(trim(p_room_code))
  for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.status = 'ended' or v_room.expires_at <= now() then raise exception 'ROOM_UNAVAILABLE'; end if;

  select exists(select 1 from public.quiz_participants p where p.room_id=v_room.id and p.user_id=p_user_id)
    into v_existing;
  if v_existing then
    return jsonb_build_object('id',v_room.id,'room_code',v_room.room_code,'already_joined',true);
  end if;

  select count(*) into v_count from public.quiz_participants p where p.room_id=v_room.id;
  if v_room.game_mode='duel' and v_count >= 2 then raise exception 'ROOM_FULL'; end if;

  select is_subscribed, free_live_quiz_used
    into v_profile
    from public.profiles
    where user_id = p_user_id
    for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  if not coalesce(v_profile.is_subscribed,false) then
    if coalesce(v_profile.free_live_quiz_used,0) >= 2 then raise exception 'LIVE_QUIZ_LIMIT_REACHED'; end if;
    update public.profiles
      set free_live_quiz_used = coalesce(free_live_quiz_used,0) + 1
      where user_id=p_user_id;
  end if;

  insert into public.quiz_participants(room_id,user_id,display_name)
  values (v_room.id,p_user_id,coalesce(nullif(trim(p_display_name),''),'Player'));

  return jsonb_build_object('id',v_room.id,'room_code',v_room.room_code,'already_joined',false);
end;
$$;

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
begin
  select * into v_room from public.quiz_rooms where id=p_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'live' or p_question_index <> v_room.current_question_index then
    raise exception 'QUESTION_NOT_ACTIVE';
  end if;
  if not exists(select 1 from public.quiz_participants p where p.room_id=p_room_id and p.user_id=p_user_id) then
    raise exception 'NOT_A_PARTICIPANT';
  end if;

  select * into v_existing from public.quiz_answers
  where room_id=p_room_id and user_id=p_user_id and question_index=p_question_index;
  if found then
    select * into v_key from private.quiz_room_answer_keys
      where room_id=p_room_id and question_index=p_question_index;
    return jsonb_build_object('already_answered',true,'is_correct',v_existing.is_correct,
      'points',v_existing.points_awarded,'correct_answer',v_key.correct_answer,
      'explanation',v_key.explanation,'exam_hint',v_key.exam_hint);
  end if;

  v_elapsed := greatest(0, floor(extract(epoch from (clock_timestamp()-v_room.question_started_at)))::integer);
  v_selected := upper(nullif(trim(p_selected_option),''));
  if v_elapsed > v_room.time_per_question then v_selected := null; end if;
  if v_selected not in ('A','B','C','D') then v_selected := null; end if;

  select * into v_key from private.quiz_room_answer_keys
  where room_id=p_room_id and question_index=p_question_index;
  if not found then raise exception 'ANSWER_KEY_NOT_FOUND'; end if;

  v_correct := v_selected is not null and v_selected=v_key.correct_answer;
  v_points := case when v_correct then
    10 + greatest(0, floor((v_room.time_per_question-v_elapsed)::numeric / v_room.time_per_question * 5)::integer)
    else 0 end;

  insert into public.quiz_answers(room_id,user_id,question_index,selected_option,time_taken,is_correct,points_awarded)
  values(p_room_id,p_user_id,p_question_index,v_selected,least(v_elapsed,v_room.time_per_question),v_correct,v_points);

  update public.quiz_participants
    set score=score+v_points
    where room_id=p_room_id and user_id=p_user_id;

  if p_user_id=v_room.host_id and v_room.reveal_until is null then
    update public.quiz_rooms set reveal_until=clock_timestamp()+interval '3 seconds', updated_at=now()
      where id=p_room_id;
  end if;

  return jsonb_build_object('already_answered',false,'is_correct',v_correct,'points',v_points,
    'correct_answer',v_key.correct_answer,'explanation',v_key.explanation,'exam_hint',v_key.exam_hint,
    'time_taken',least(v_elapsed,v_room.time_per_question));
end;
$$;

create or replace function public.live_quiz_start_room_internal(p_user_id uuid,p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.quiz_rooms%rowtype;
  v_count integer;
begin
  select * into v_room from public.quiz_rooms where id=p_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.host_id<>p_user_id then raise exception 'HOST_ONLY'; end if;
  if v_room.status<>'waiting' then raise exception 'ROOM_NOT_WAITING'; end if;
  select count(*) into v_count from public.quiz_participants where room_id=p_room_id;
  if v_room.game_mode='duel' and v_count<>2 then raise exception 'DUEL_REQUIRES_TWO_PLAYERS'; end if;
  update public.quiz_rooms set status='live',current_question_index=0,
    question_started_at=clock_timestamp(),reveal_until=null,updated_at=now()
    where id=p_room_id;
  return jsonb_build_object('status','live','current_question_index',0);
end;
$$;

create or replace function public.live_quiz_advance_room_internal(p_user_id uuid,p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.quiz_rooms%rowtype;
  v_next integer;
begin
  select * into v_room from public.quiz_rooms where id=p_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.host_id<>p_user_id then raise exception 'HOST_ONLY'; end if;
  if v_room.status<>'live' then raise exception 'ROOM_NOT_LIVE'; end if;
  if v_room.reveal_until is not null and clock_timestamp()<v_room.reveal_until
     and clock_timestamp()<v_room.question_started_at + make_interval(secs=>v_room.time_per_question) then
    raise exception 'REVEAL_PERIOD_ACTIVE';
  end if;
  if v_room.reveal_until is null and clock_timestamp()<v_room.question_started_at + make_interval(secs=>v_room.time_per_question) then
    raise exception 'QUESTION_TIMER_ACTIVE';
  end if;

  v_next := v_room.current_question_index+1;
  if v_next >= v_room.num_questions then
    update public.quiz_rooms set status='ended',updated_at=now() where id=p_room_id;
    return jsonb_build_object('status','ended');
  end if;
  update public.quiz_rooms set current_question_index=v_next,question_started_at=clock_timestamp(),
    reveal_until=null,updated_at=now() where id=p_room_id;
  return jsonb_build_object('status','live','current_question_index',v_next);
end;
$$;

revoke all on function public.live_quiz_create_room_internal(uuid,text,text,integer,jsonb,jsonb,text) from public, anon, authenticated;
revoke all on function public.live_quiz_join_room_internal(uuid,text,text) from public, anon, authenticated;
revoke all on function public.live_quiz_submit_answer_internal(uuid,uuid,integer,text) from public, anon, authenticated;
revoke all on function public.live_quiz_start_room_internal(uuid,uuid) from public, anon, authenticated;
revoke all on function public.live_quiz_advance_room_internal(uuid,uuid) from public, anon, authenticated;
grant execute on function public.live_quiz_create_room_internal(uuid,text,text,integer,jsonb,jsonb,text) to service_role;
grant execute on function public.live_quiz_join_room_internal(uuid,text,text) to service_role;
grant execute on function public.live_quiz_submit_answer_internal(uuid,uuid,integer,text) to service_role;
grant execute on function public.live_quiz_start_room_internal(uuid,uuid) to service_role;
grant execute on function public.live_quiz_advance_room_internal(uuid,uuid) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='quiz_rooms'
  ) then alter publication supabase_realtime add table public.quiz_rooms; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='quiz_participants'
  ) then alter publication supabase_realtime add table public.quiz_participants; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='quiz_answers'
  ) then alter publication supabase_realtime add table public.quiz_answers; end if;
end $$;
