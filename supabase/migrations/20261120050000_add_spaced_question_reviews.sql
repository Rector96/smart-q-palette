create table if not exists public.student_question_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  repetitions integer not null default 0 check (repetitions >= 0),
  interval_days integer not null default 1 check (interval_days >= 1),
  due_at timestamptz not null default (now() + interval '1 day'),
  last_reviewed_at timestamptz not null default now(),
  last_result boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, question_id)
);
create index if not exists student_question_reviews_due_idx
  on public.student_question_reviews (user_id, due_at);
create index if not exists student_question_reviews_question_idx
  on public.student_question_reviews (question_id);
alter table public.student_question_reviews enable row level security;
drop policy if exists "Students can read their own question reviews" on public.student_question_reviews;
create policy "Students can read their own question reviews"
  on public.student_question_reviews for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.student_question_reviews from anon, authenticated;
grant select on public.student_question_reviews to authenticated;

create or replace function public.schedule_student_question_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_review public.student_question_reviews%rowtype;
  next_repetitions integer;
  next_interval integer;
begin
  select * into current_review
  from public.student_question_reviews
  where user_id = new.user_id and question_id = new.question_id
  for update;

  if not found then
    if not new.is_correct then
      insert into public.student_question_reviews
        (user_id, question_id, repetitions, interval_days, due_at, last_reviewed_at, last_result)
      values
        (new.user_id, new.question_id, 0, 1, now() + interval '1 day', new.answered_at, false)
      on conflict (user_id, question_id) do nothing;
    end if;
    return new;
  end if;

  if new.is_correct then
    next_repetitions := current_review.repetitions + 1;
    next_interval := case
      when next_repetitions = 1 then 3
      when next_repetitions = 2 then 7
      when next_repetitions = 3 then 14
      else 30
    end;
    update public.student_question_reviews
      set repetitions = next_repetitions,
          interval_days = next_interval,
          due_at = new.answered_at + make_interval(days => next_interval),
          last_reviewed_at = new.answered_at,
          last_result = true,
          updated_at = now()
      where id = current_review.id;
  else
    update public.student_question_reviews
      set repetitions = 0,
          interval_days = 1,
          due_at = new.answered_at + interval '1 day',
          last_reviewed_at = new.answered_at,
          last_result = false,
          updated_at = now()
      where id = current_review.id;
  end if;
  return new;
end;
$$;
revoke all on function public.schedule_student_question_review() from public, anon, authenticated;
drop trigger if exists user_history_schedule_question_review on public.user_history;
create trigger user_history_schedule_question_review
  after insert on public.user_history
  for each row execute function public.schedule_student_question_review();
