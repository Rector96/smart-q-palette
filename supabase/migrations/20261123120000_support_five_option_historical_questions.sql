alter table public.questions add column if not exists option_e text;
alter table public.questions drop constraint if exists questions_correct_answer_check;
alter table public.questions add constraint questions_correct_answer_check check (correct_answer in ('A','B','C','D','E'));
alter table public.user_history drop constraint if exists user_history_selected_answer_check;
alter table public.user_history add constraint user_history_selected_answer_check check (selected_answer in ('A','B','C','D','E','X'));
