create or replace function private.can_read_completed_exam_question(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.exam_session_questions esq
    join public.exam_sessions s on s.id = esq.session_id
    where esq.question_id = p_question_id
      and s.user_id = (select auth.uid())
      and s.completed = true
  );
$$;

revoke all on function private.can_read_completed_exam_question(uuid) from public, anon;
grant execute on function private.can_read_completed_exam_question(uuid) to authenticated;

create policy questions_select_completed_exam
on public.questions
for select to authenticated
using (private.can_read_completed_exam_question(id));
