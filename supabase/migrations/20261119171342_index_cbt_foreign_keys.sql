create index shared_exams_creator_idx on public.shared_exams(creator_id);
create index shared_exams_session_idx on public.shared_exams(session_id);
create index user_history_session_idx on public.user_history(session_id);
create index user_seen_questions_question_idx on public.user_seen_questions(question_id);
