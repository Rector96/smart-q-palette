
-- SdashAPI Past Questions: isolated exam storage
-- Does not modify the existing ROCKCRAFT CBT question bank.

begin;

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

-- 1. Exam sessions
create table public.sdashapi_exam_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  examination text not null check (examination in ('WAEC', 'JAMB')),
  subject text not null,
  exam_year integer not null check (exam_year between 1900 and 2100),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'submitted', 'expired')),
  total_questions integer not null check (total_questions between 1 and 100),
  correct_count integer,
  score numeric(5,2),
  duration_seconds integer not null default 0
    check (duration_seconds >= 0),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),

  constraint sdashapi_score_valid check (
    (correct_count is null and score is null)
    or (
      correct_count between 0 and total_questions
      and score between 0 and 100
    )
  ),

  constraint sdashapi_submission_state_valid check (
    (status = 'in_progress' and submitted_at is null)
    or (status in ('submitted', 'expired') and submitted_at is not null)
  )
);

-- 2. Snapshot of questions returned by SdashAPI.
-- No correct answers or solutions are stored here.
create table public.sdashapi_session_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null
    references public.sdashapi_exam_sessions(id) on delete cascade,
  position integer not null check (position between 1 and 100),
  sdashapi_question_id bigint not null,
  question_text text not null,
  options jsonb not null,
  image text,
  created_at timestamptz not null default now(),

  unique (session_id, position),

  constraint sdashapi_options_object check (
    jsonb_typeof(options) = 'object'
  )
);

-- 3. Private answer keys and original provider solutions.
create table private.sdashapi_answer_keys (
  session_id uuid not null
    references public.sdashapi_exam_sessions(id) on delete cascade,
  question_position integer not null,
  correct_answer text not null
    check (correct_answer in ('A', 'B', 'C', 'D', 'E')),
  solution text,
  primary key (session_id, question_position),

  constraint sdashapi_answer_key_question_fk
    foreign key (session_id, question_position)
    references public.sdashapi_session_questions(session_id, position)
    on delete cascade
);

-- 4. Student submissions.
create table public.sdashapi_attempt_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null
    references public.sdashapi_exam_sessions(id) on delete cascade,
  question_position integer not null,
  selected_answer text
    check (selected_answer is null or selected_answer in ('A', 'B', 'C', 'D', 'E')),
  time_spent_seconds integer not null default 0
    check (time_spent_seconds >= 0),
  is_correct boolean not null default false,
  created_at timestamptz not null default now(),

  unique (session_id, question_position),

  constraint sdashapi_attempt_question_fk
    foreign key (session_id, question_position)
    references public.sdashapi_session_questions(session_id, position)
    on delete cascade
);

-- Indexes
create index sdashapi_sessions_user_idx
  on public.sdashapi_exam_sessions(user_id, created_at desc);

create index sdashapi_sessions_status_idx
  on public.sdashapi_exam_sessions(status);

create index sdashapi_questions_session_idx
  on public.sdashapi_session_questions(session_id, position);

create index sdashapi_attempts_session_idx
  on public.sdashapi_attempt_answers(session_id);

-- Row Level Security
alter table public.sdashapi_exam_sessions enable row level security;
alter table public.sdashapi_session_questions enable row level security;
alter table public.sdashapi_attempt_answers enable row level security;
alter table private.sdashapi_answer_keys enable row level security;

-- No direct client access. Edge Functions use service_role.
revoke all on public.sdashapi_exam_sessions
  from public, anon, authenticated;

revoke all on public.sdashapi_session_questions
  from public, anon, authenticated;

revoke all on public.sdashapi_attempt_answers
  from public, anon, authenticated;

revoke all on private.sdashapi_answer_keys
  from public, anon, authenticated, service_role;

grant all on public.sdashapi_exam_sessions to service_role;
grant all on public.sdashapi_session_questions to service_role;
grant all on public.sdashapi_attempt_answers to service_role;
grant select, insert, update, delete
on private.sdashapi_answer_keys
to service_role;

commit;
