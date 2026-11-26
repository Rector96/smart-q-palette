-- ROCKCBT Live Quiz: additive foundation for Live and Assigned modes.
-- Existing quiz tables and legacy quiz flows are preserved.

create table if not exists public.quiz_classes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists quiz_classes_owner_name_uidx
  on public.quiz_classes(owner_id, lower(name));

create table if not exists public.quiz_class_members (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.quiz_classes(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete cascade,
  display_name text,
  joined_at timestamptz not null default now(),
  unique (class_id, student_id)
);

alter table public.quiz_rooms
  add column if not exists title text,
  add column if not exists session_mode text not null default 'live',
  add column if not exists answer_reveal_mode text not null default 'after_question',
  add column if not exists duration_seconds integer not null default 1800,
  add column if not exists assignment_deadline timestamptz,
  add column if not exists max_participants integer not null default 100,
  add column if not exists min_participants integer not null default 1,
  add column if not exists allow_late_join boolean not null default true,
  add column if not exists is_locked boolean not null default false,
  add column if not exists host_participates boolean not null default false,
  add column if not exists shuffle_questions boolean not null default true,
  add column if not exists shuffle_options boolean not null default true,
  add column if not exists calculator_allowed boolean not null default false,
  add column if not exists paused_at timestamptz,
  add column if not exists paused_remaining_seconds integer,
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists class_id uuid references public.quiz_classes(id) on delete set null;

alter table public.quiz_rooms
  drop constraint if exists quiz_rooms_status_check;

alter table public.quiz_rooms
  add constraint quiz_rooms_status_check
  check (status in ('waiting', 'live', 'paused', 'ended'));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.quiz_rooms'::regclass
      and conname = 'quiz_rooms_session_mode_check'
  ) then
    alter table public.quiz_rooms
      add constraint quiz_rooms_session_mode_check
      check (session_mode in ('live', 'assigned'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.quiz_rooms'::regclass
      and conname = 'quiz_rooms_reveal_mode_check'
  ) then
    alter table public.quiz_rooms
      add constraint quiz_rooms_reveal_mode_check
      check (answer_reveal_mode in ('after_question', 'after_quiz'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.quiz_rooms'::regclass
      and conname = 'quiz_rooms_duration_check'
  ) then
    alter table public.quiz_rooms
      add constraint quiz_rooms_duration_check
      check (duration_seconds between 60 and 86400);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.quiz_rooms'::regclass
      and conname = 'quiz_rooms_capacity_check'
  ) then
    alter table public.quiz_rooms
      add constraint quiz_rooms_capacity_check
      check (
        max_participants between 2 and 1000
        and min_participants between 1 and max_participants
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.quiz_rooms'::regclass
      and conname = 'quiz_rooms_pause_remaining_check'
  ) then
    alter table public.quiz_rooms
      add constraint quiz_rooms_pause_remaining_check
      check (paused_remaining_seconds is null or paused_remaining_seconds >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.quiz_rooms'::regclass
      and conname = 'quiz_rooms_assigned_deadline_check'
  ) then
    alter table public.quiz_rooms
      add constraint quiz_rooms_assigned_deadline_check
      check (session_mode <> 'assigned' or assignment_deadline is not null);
  end if;
end;
$$;

-- One independent attempt per participant per room.
create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.quiz_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_host_attempt boolean not null default false,
  status text not null default 'waiting'
    check (status in ('waiting', 'in_progress', 'submitted', 'expired')),
  current_question_index integer not null default 0
    check (current_question_index >= 0),
  duration_seconds integer not null check (duration_seconds between 60 and 86400),
  started_at timestamptz,
  deadline_at timestamptz,
  submitted_at timestamptz,
  score integer not null default 0 check (score >= 0),
  total_questions integer not null check (total_questions between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create index if not exists quiz_attempts_room_status_idx
  on public.quiz_attempts(room_id, status);

create index if not exists quiz_attempts_user_created_idx
  on public.quiz_attempts(user_id, created_at desc);

-- Private answer records for the new attempt engine.
-- Correctness and scoring fields are never directly readable by clients.
create table if not exists public.quiz_attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  room_id uuid not null references public.quiz_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_index integer not null check (question_index >= 0),
  selected_option text check (
    selected_option is null or selected_option in ('A', 'B', 'C', 'D', 'E')
  ),
  is_correct boolean not null default false,
  points_awarded integer not null default 0 check (points_awarded >= 0),
  time_taken integer not null default 0 check (time_taken >= 0),
  is_flagged boolean not null default false,
  answered_at timestamptz not null default now(),
  unique (attempt_id, question_index)
);

create index if not exists quiz_attempt_answers_room_idx
  on public.quiz_attempt_answers(room_id);

create index if not exists quiz_attempt_answers_user_idx
  on public.quiz_attempt_answers(user_id, attempt_id);

-- All new records are accessed through trusted Edge Function/service-role
-- operations. Do not expose answer keys, correctness, or other attempts.
alter table public.quiz_classes enable row level security;
alter table public.quiz_class_members enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_attempt_answers enable row level security;

revoke all on public.quiz_classes from anon, authenticated;
revoke all on public.quiz_class_members from anon, authenticated;
revoke all on public.quiz_attempts from anon, authenticated;
revoke all on public.quiz_attempt_answers from anon, authenticated;

grant all on public.quiz_classes to service_role;
grant all on public.quiz_class_members to service_role;
grant all on public.quiz_attempts to service_role;
grant all on public.quiz_attempt_answers to service_role;

grant select, insert, update, delete on public.quiz_classes to service_role;
grant select, insert, update, delete on public.quiz_class_members to service_role;
grant select, insert, update, delete on public.quiz_attempts to service_role;
grant select, insert, update, delete on public.quiz_attempt_answers to service_role;

comment on table public.quiz_attempts is
  'Independent student attempts for ROCKCBT Live and Assigned quizzes.';

comment on table public.quiz_attempt_answers is
  'Private per-attempt answers; access only through trusted backend actions.';

comment on column public.quiz_rooms.session_mode is
  'live starts participants together; assigned starts each participant independently.';

comment on column public.quiz_rooms.answer_reveal_mode is
  'after_question reveals a submitted question; after_quiz waits for the session end or assignment deadline.';
