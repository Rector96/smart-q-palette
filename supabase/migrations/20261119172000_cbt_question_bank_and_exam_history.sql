create table public.questions (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  topic text not null,
  year integer,
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  question_text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_answer text not null check (correct_answer in ('A','B','C','D')),
  explanation text,
  passage text,
  question_type text default 'standard',
  exam_hint text,
  created_at timestamptz not null default now()
);

create table public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('practice','cbt','mock','revision')),
  subjects text[] not null default '{}',
  total_questions integer not null default 0 check (total_questions >= 0),
  correct_answers integer not null default 0 check (correct_answers >= 0),
  score_percentage numeric(5,2) not null default 0 check (score_percentage between 0 and 100),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  completed boolean not null default false,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.user_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_answer text not null check (selected_answer in ('A','B','C','D','X')),
  is_correct boolean not null,
  time_spent_seconds integer not null default 0 check (time_spent_seconds >= 0),
  session_id uuid references public.exam_sessions(id) on delete set null,
  answered_at timestamptz not null default now()
);

create table public.user_seen_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  seen_at timestamptz not null default now(),
  unique (user_id, question_id)
);

create table public.shared_exams (
  id uuid primary key default gen_random_uuid(),
  share_code text not null unique,
  creator_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.exam_sessions(id) on delete set null,
  mode text not null check (mode in ('practice','cbt','mock','revision')),
  subjects text[] not null default '{}',
  timer_minutes integer check (timer_minutes is null or timer_minutes > 0),
  created_at timestamptz not null default now()
);

create index questions_subject_idx on public.questions(subject);
create index questions_subject_topic_idx on public.questions(subject, topic);
create index questions_difficulty_idx on public.questions(difficulty);
create index exam_sessions_user_started_idx on public.exam_sessions(user_id, started_at desc);
create index user_history_user_answered_idx on public.user_history(user_id, answered_at desc);
create index user_history_question_idx on public.user_history(question_id);
create index user_seen_questions_user_idx on public.user_seen_questions(user_id);
create index shared_exams_share_code_idx on public.shared_exams(share_code);

alter table public.questions enable row level security;
alter table public.exam_sessions enable row level security;
alter table public.user_history enable row level security;
alter table public.user_seen_questions enable row level security;
alter table public.shared_exams enable row level security;

create policy questions_admin_select on public.questions
  for select to authenticated
  using (private.has_role((select auth.uid()), 'admin'));
create policy questions_admin_insert on public.questions
  for insert to authenticated
  with check (private.has_role((select auth.uid()), 'admin'));
create policy questions_admin_update on public.questions
  for update to authenticated
  using (private.has_role((select auth.uid()), 'admin'))
  with check (private.has_role((select auth.uid()), 'admin'));
create policy questions_admin_delete on public.questions
  for delete to authenticated
  using (private.has_role((select auth.uid()), 'admin'));

create policy exam_sessions_select_own on public.exam_sessions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_history_select_own on public.user_history
  for select to authenticated using ((select auth.uid()) = user_id);

create policy user_seen_select_own on public.user_seen_questions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_seen_insert_own on public.user_seen_questions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_seen_delete_own on public.user_seen_questions
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy shared_exams_select_public on public.shared_exams
  for select to anon, authenticated using (true);
create policy shared_exams_insert_own on public.shared_exams
  for insert to authenticated with check ((select auth.uid()) = creator_id);

grant select, insert, update, delete on public.questions to authenticated;
grant select on public.exam_sessions, public.user_history to authenticated;
grant select, insert, delete on public.user_seen_questions to authenticated;
grant select on public.shared_exams to anon, authenticated;
grant insert on public.shared_exams to authenticated;
