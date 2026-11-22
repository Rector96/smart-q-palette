
grant usage on schema private to authenticated;

create or replace function private.is_live_quiz_member(p_room_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid()) and exists (
    select 1
    from public.quiz_participants p
    where p.room_id = p_room_id and p.user_id = p_user_id
  );
$$;

revoke all on function private.is_live_quiz_member(uuid,uuid) from public, anon;
grant execute on function private.is_live_quiz_member(uuid,uuid) to authenticated;

create policy "Service role manages private live quiz answer keys"
on private.quiz_room_answer_keys
for all to service_role
using (true)
with check (true);

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
  if v_room.reveal_until is not null and clock_timestamp()<v_room.reveal_until then
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

create or replace function public.live_quiz_rematch_room_internal(
  p_user_id uuid,
  p_old_room_id uuid,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.quiz_rooms%rowtype;
  v_profile record;
  v_new_room_id uuid;
  v_new_code text;
begin
  select * into v_old from public.quiz_rooms where id=p_old_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_old.host_id<>p_user_id then raise exception 'HOST_ONLY'; end if;
  if v_old.status<>'ended' then raise exception 'ROOM_NOT_ENDED'; end if;

  select is_subscribed,free_live_quiz_used into v_profile
  from public.profiles where user_id=p_user_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  if not coalesce(v_profile.is_subscribed,false) then
    if coalesce(v_profile.free_live_quiz_used,0)>=2 then raise exception 'LIVE_QUIZ_LIMIT_REACHED'; end if;
    update public.profiles set free_live_quiz_used=coalesce(free_live_quiz_used,0)+1 where user_id=p_user_id;
  end if;

  loop
    v_new_code := (case when v_old.game_mode='duel' then 'D' else '' end)
      || (floor(random()*9000)::integer+1000)::text;
    exit when not exists(select 1 from public.quiz_rooms r where r.room_code=v_new_code);
  end loop;

  insert into public.quiz_rooms
    (host_id,subject,game_mode,num_questions,time_per_question,room_code,questions,expires_at)
  values
    (p_user_id,v_old.subject,v_old.game_mode,v_old.num_questions,v_old.time_per_question,
     v_new_code,v_old.questions,now()+interval '2 hours')
  returning id into v_new_room_id;

  insert into private.quiz_room_answer_keys(room_id,question_index,correct_answer,explanation,exam_hint)
  select v_new_room_id,question_index,correct_answer,explanation,exam_hint
  from private.quiz_room_answer_keys where room_id=p_old_room_id;

  insert into public.quiz_participants(room_id,user_id,display_name)
  values(v_new_room_id,p_user_id,coalesce(nullif(trim(p_display_name),''),'Host'));

  return jsonb_build_object('id',v_new_room_id,'room_code',v_new_code,'status','waiting');
end;
$$;

revoke all on function public.live_quiz_rematch_room_internal(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.live_quiz_rematch_room_internal(uuid,uuid,text) to service_role;
