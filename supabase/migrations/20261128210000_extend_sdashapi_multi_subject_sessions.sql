-- Prepare SdashAPI-backed sessions for the same Practice / CBT / Mock
-- session shape as the local question provider. Existing rows remain valid.
begin;

alter table public.sdashapi_exam_sessions
  add column if not exists exam_mode text not null default 'cbt',
  add column if not exists subjects text[] not null default '{}',
  add column if not exists subject_question_counts jsonb not null default '{}'::jsonb,
  add column if not exists allowed_duration_seconds integer;

update public.sdashapi_exam_sessions
set
  subjects = case
    when cardinality(subjects) = 0 then array[subject]
    else subjects
  end,
  subject_question_counts = case
    when subject_question_counts = '{}'::jsonb
      then jsonb_build_object(subject, total_questions)
    else subject_question_counts
  end,
  allowed_duration_seconds = case
    when allowed_duration_seconds is null then
      case when duration_seconds >= 60 then duration_seconds else 3600 end
    else allowed_duration_seconds
  end;

alter table public.sdashapi_exam_sessions
  alter column allowed_duration_seconds set default 3600,
  alter column allowed_duration_seconds set not null;

alter table public.sdashapi_exam_sessions
  drop constraint if exists sdashapi_exam_sessions_total_questions_check,
  drop constraint if exists sdashapi_exam_sessions_exam_mode_check,
  drop constraint if exists sdashapi_exam_sessions_allowed_duration_seconds_check;

alter table public.sdashapi_exam_sessions
  add constraint sdashapi_exam_sessions_total_questions_check
    check (total_questions between 1 and 720),
  add constraint sdashapi_exam_sessions_exam_mode_check
    check (exam_mode in ('practice', 'cbt', 'mock')),
  add constraint sdashapi_exam_sessions_allowed_duration_seconds_check
    check (allowed_duration_seconds between 60 and 86400),
  add constraint sdashapi_exam_sessions_subjects_check
    check (
      (cardinality(subjects) = 0 or cardinality(subjects) between 1 and 12)
      and array_position(subjects, null) is null
    ),
  add constraint sdashapi_exam_sessions_subject_counts_object_check
    check (jsonb_typeof(subject_question_counts) = 'object');

alter table public.sdashapi_session_questions
  add column if not exists subject text;

update public.sdashapi_session_questions q
set subject = s.subject
from public.sdashapi_exam_sessions s
where s.id = q.session_id
  and q.subject is null;

alter table public.sdashapi_session_questions
  alter column subject set not null;

alter table public.sdashapi_session_questions
  drop constraint if exists sdashapi_session_questions_position_check;

alter table public.sdashapi_session_questions
  add constraint sdashapi_session_questions_position_check
    check (position between 1 and 720);

comment on column public.sdashapi_exam_sessions.exam_mode is
  'Student-facing mode shared by local and SdashAPI providers.';
comment on column public.sdashapi_exam_sessions.subjects is
  'Ordered subjects selected for this exam session.';
comment on column public.sdashapi_exam_sessions.subject_question_counts is
  'Per-subject allocations; keys must match subjects when creating new sessions.';
comment on column public.sdashapi_exam_sessions.allowed_duration_seconds is
  'One overall countdown duration for the entire session.';
comment on column public.sdashapi_session_questions.subject is
  'Subject owning this question, used for Mock subject tabs and result breakdowns.';

commit;
