create table if not exists public.student_topic_mastery (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  topic text not null,
  attempts integer not null default 0 check (attempts >= 0),
  correct_answers integer not null default 0 check (correct_answers >= 0 and correct_answers <= attempts),
  last_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_topic_mastery_user_subject_topic_key unique (user_id, subject, topic)
);

alter table public.student_topic_mastery enable row level security;

drop policy if exists "Students can read their own topic mastery" on public.student_topic_mastery;
create policy "Students can read their own topic mastery"
  on public.student_topic_mastery for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.student_topic_mastery to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.student_topic_mastery from anon, authenticated;

create or replace function public.update_student_topic_mastery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  question_subject text;
  question_topic text;
begin
  select q.subject, q.topic
    into question_subject, question_topic
    from public.questions q
   where q.id = new.question_id;

  if question_subject is null or question_topic is null
     or btrim(question_subject) = '' or btrim(question_topic) = '' then
    return new;
  end if;

  insert into public.student_topic_mastery
    (user_id, subject, topic, attempts, correct_answers, last_attempt_at, updated_at)
  values
    (new.user_id, question_subject, question_topic, 1,
     case when new.is_correct then 1 else 0 end, new.answered_at, now())
  on conflict (user_id, subject, topic)
  do update set
    attempts = public.student_topic_mastery.attempts + 1,
    correct_answers = public.student_topic_mastery.correct_answers + excluded.correct_answers,
    last_attempt_at = greatest(public.student_topic_mastery.last_attempt_at, excluded.last_attempt_at),
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.update_student_topic_mastery() from public, anon, authenticated;

drop trigger if exists user_history_update_topic_mastery on public.user_history;
create trigger user_history_update_topic_mastery
after insert on public.user_history
for each row execute function public.update_student_topic_mastery();

insert into public.student_topic_mastery
  (user_id, subject, topic, attempts, correct_answers, last_attempt_at)
select h.user_id, q.subject, q.topic, count(*)::integer,
       count(*) filter (where h.is_correct)::integer, max(h.answered_at)
  from public.user_history h
  join public.questions q on q.id = h.question_id
 where nullif(btrim(q.subject), '') is not null
   and nullif(btrim(q.topic), '') is not null
 group by h.user_id, q.subject, q.topic
on conflict (user_id, subject, topic)
do update set
  attempts = excluded.attempts,
  correct_answers = excluded.correct_answers,
  last_attempt_at = excluded.last_attempt_at,
  updated_at = now();
