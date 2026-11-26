-- Live Quiz host controls. All functions are service-role only.
alter table public.quiz_rooms
  add column if not exists paused_reveal_remaining_seconds integer,
  add column if not exists paused_duration_remaining_seconds integer;

comment on column public.quiz_rooms.paused_reveal_remaining_seconds is
  'Remaining answer-reveal countdown preserved while a live room is paused.';

comment on column public.quiz_rooms.paused_duration_remaining_seconds is
  'Remaining overall quiz duration preserved while a live room is paused.';

create or replace function public.live_quiz_stamp_started_at_internal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'waiting'
     and new.status = 'live'
     and coalesce(new.session_mode, 'live') = 'live'
     and new.started_at is null then
    new.started_at := clock_timestamp();
  end if;

  return new;
end;
$$;

drop trigger if exists quiz_rooms_stamp_started_at
  on public.quiz_rooms;

create trigger quiz_rooms_stamp_started_at
before update of status on public.quiz_rooms
for each row
execute function public.live_quiz_stamp_started_at_internal();

revoke all on function public.live_quiz_stamp_started_at_internal()
  from public, anon, authenticated, service_role;

create or replace function public.live_quiz_pause_room_internal(
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
  v_remaining integer;
  v_reveal_remaining integer;
  v_duration_remaining integer;
begin
  select * into v_room
  from public.quiz_rooms
  where id = p_room_id
  for update;

  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.host_id <> p_user_id then raise exception 'HOST_ONLY'; end if;
  if v_room.status <> 'live' then raise exception 'ROOM_NOT_LIVE'; end if;

  v_remaining := greatest(
    0,
    ceil(extract(epoch from (
      v_room.question_started_at
      + make_interval(secs => v_room.time_per_question)
      - clock_timestamp()
    )))::integer
  );

  v_duration_remaining := case
    when v_room.started_at is null then v_room.duration_seconds
    else greatest(
      0,
      ceil(extract(epoch from (
        v_room.started_at
        + make_interval(secs => v_room.duration_seconds)
        - clock_timestamp()
      )))::integer
    )
  end;

  v_reveal_remaining := case
    when v_room.reveal_until is null then null
    else greatest(
      0,
      ceil(extract(epoch from (
        v_room.reveal_until - clock_timestamp()
      )))::integer
    )
  end;

  update public.quiz_rooms
  set status = 'paused',
      paused_at = clock_timestamp(),
      paused_remaining_seconds = v_remaining,
      paused_duration_remaining_seconds = v_duration_remaining,
      paused_reveal_remaining_seconds = v_reveal_remaining,
      updated_at = now()
  where id = p_room_id;

  return jsonb_build_object(
    'status', 'paused',
    'remaining_seconds', v_remaining,
    'duration_remaining_seconds', v_duration_remaining,
    'reveal_remaining_seconds', v_reveal_remaining
  );
end;
$$;

create or replace function public.live_quiz_resume_room_internal(
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
begin
  select * into v_room
  from public.quiz_rooms
  where id = p_room_id
  for update;

  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.host_id <> p_user_id then raise exception 'HOST_ONLY'; end if;
  if v_room.status <> 'paused' then raise exception 'ROOM_NOT_PAUSED'; end if;

  update public.quiz_rooms
  set status = 'live',
      started_at = clock_timestamp()
        - make_interval(secs =>
            greatest(
              0,
              v_room.duration_seconds
              - coalesce(
                  v_room.paused_duration_remaining_seconds,
                  v_room.duration_seconds
                )
            )
          ),
      question_started_at = clock_timestamp()
        - make_interval(secs =>
            v_room.time_per_question
            - coalesce(v_room.paused_remaining_seconds, 0)
          ),
      reveal_until = case
        when v_room.paused_reveal_remaining_seconds is null then null
        when v_room.paused_reveal_remaining_seconds <= 0 then null
        else clock_timestamp()
          + make_interval(secs => v_room.paused_reveal_remaining_seconds)
      end,
      paused_at = null,
      paused_remaining_seconds = null,
      paused_duration_remaining_seconds = null,
      paused_reveal_remaining_seconds = null,
      updated_at = now()
  where id = p_room_id;

  return jsonb_build_object('status', 'live');
end;
$$;

create or replace function public.live_quiz_set_room_lock_internal(
  p_user_id uuid,
  p_room_id uuid,
  p_locked boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.quiz_rooms%rowtype;
begin
  if p_locked is null then raise exception 'INVALID_LOCK_STATE'; end if;

  select * into v_room
  from public.quiz_rooms
  where id = p_room_id
  for update;

  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.host_id <> p_user_id then raise exception 'HOST_ONLY'; end if;
  if v_room.status = 'ended' then raise exception 'ROOM_ENDED'; end if;

  update public.quiz_rooms
  set is_locked = p_locked,
      updated_at = now()
  where id = p_room_id;

  return jsonb_build_object('is_locked', p_locked);
end;
$$;

create or replace function public.live_quiz_end_room_internal(
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
begin
  select * into v_room
  from public.quiz_rooms
  where id = p_room_id
  for update;

  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.host_id <> p_user_id then raise exception 'HOST_ONLY'; end if;
  if v_room.status = 'ended' then
    return jsonb_build_object('status', 'ended', 'already_ended', true);
  end if;

  update public.quiz_rooms
  set status = 'ended',
      ended_at = clock_timestamp(),
      is_locked = true,
      paused_at = null,
      paused_remaining_seconds = null,
      paused_duration_remaining_seconds = null,
      paused_reveal_remaining_seconds = null,
      updated_at = now()
  where id = p_room_id;

  return jsonb_build_object('status', 'ended');
end;
$$;

revoke all on function public.live_quiz_pause_room_internal(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.live_quiz_resume_room_internal(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.live_quiz_set_room_lock_internal(uuid,uuid,boolean)
  from public, anon, authenticated;
revoke all on function public.live_quiz_end_room_internal(uuid,uuid)
  from public, anon, authenticated;

grant execute on function public.live_quiz_pause_room_internal(uuid,uuid)
  to service_role;
grant execute on function public.live_quiz_resume_room_internal(uuid,uuid)
  to service_role;
grant execute on function public.live_quiz_set_room_lock_internal(uuid,uuid,boolean)
  to service_role;
grant execute on function public.live_quiz_end_room_internal(uuid,uuid)
  to service_role;
