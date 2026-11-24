-- Add fifth-option and diagram support across CBT and Live Quiz.
alter table public.questions
  add column if not exists option_e text,
  add column if not exists diagram_url text;

alter table public.questions
  drop constraint if exists questions_correct_answer_check;

alter table public.questions
  add constraint questions_correct_answer_check
  check (correct_answer in ('A', 'B', 'C', 'D', 'E'));

alter table public.questions
  drop constraint if exists questions_correct_answer_requires_option_e;

alter table public.questions
  add constraint questions_correct_answer_requires_option_e
  check (correct_answer <> 'E' or nullif(btrim(option_e), '') is not null);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-diagrams',
  'question-diagrams',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.is_question_content_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role::text = 'admin'
  );
$$;

revoke all on function public.is_question_content_admin() from public, anon;
grant execute on function public.is_question_content_admin() to authenticated;

drop policy if exists "Question diagrams are publicly readable" on storage.objects;
create policy "Question diagrams are publicly readable"
on storage.objects for select to public
using (bucket_id = 'question-diagrams');

drop policy if exists "Admins upload question diagrams" on storage.objects;
create policy "Admins upload question diagrams"
on storage.objects for insert to authenticated
with check (bucket_id = 'question-diagrams' and public.is_question_content_admin());

drop policy if exists "Admins update question diagrams" on storage.objects;
create policy "Admins update question diagrams"
on storage.objects for update to authenticated
using (bucket_id = 'question-diagrams' and public.is_question_content_admin())
with check (bucket_id = 'question-diagrams' and public.is_question_content_admin());

drop policy if exists "Admins delete question diagrams" on storage.objects;
create policy "Admins delete question diagrams"
on storage.objects for delete to authenticated
using (bucket_id = 'question-diagrams' and public.is_question_content_admin());

alter table public.user_history
  drop constraint if exists user_history_selected_answer_check;
alter table public.user_history
  add constraint user_history_selected_answer_check
  check (selected_answer in ('A', 'B', 'C', 'D', 'E', 'X'));

alter table public.exam_session_questions
  drop constraint if exists exam_session_questions_option_order_check;
alter table public.exam_session_questions
  add constraint exam_session_questions_option_order_check
  check (
    cardinality(option_order) in (4, 5)
    and option_order <@ array['A', 'B', 'C', 'D', 'E']::text[]
    and array['A', 'B', 'C', 'D']::text[] <@ option_order
    and (cardinality(option_order) = 4 or 'E' = any(option_order))
    and cardinality(array_positions(option_order, 'A')) = 1
    and cardinality(array_positions(option_order, 'B')) = 1
    and cardinality(array_positions(option_order, 'C')) = 1
    and cardinality(array_positions(option_order, 'D')) = 1
    and cardinality(array_positions(option_order, 'E')) = case when cardinality(option_order) = 5 then 1 else 0 end
  );

create or replace function public.submit_cbt_session(p_session_id uuid, p_user_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.exam_sessions%rowtype;
  v_answer jsonb;
  v_question_id uuid;
  v_selected text;
  v_time integer;
  v_option_order text[];
  v_original_answer text;
  v_correct boolean;
  v_correct_count integer := 0;
  v_answer_count integer := 0;
  v_details jsonb := '[]'::jsonb;
  v_elapsed integer;
begin
  if p_session_id is null or p_user_id is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Invalid submission payload' using errcode = '22023';
  end if;
  select * into v_session from public.exam_sessions
  where id = p_session_id and user_id = p_user_id for update;
  if not found then raise exception 'Exam session not found' using errcode = 'P0002'; end if;
  if v_session.completed then raise exception 'This exam has already been submitted' using errcode = '23505'; end if;
  if jsonb_array_length(p_answers) <> v_session.total_questions then
    raise exception 'Submission must include every question exactly once' using errcode = '22023';
  end if;

  for v_answer in select value from jsonb_array_elements(p_answers) loop
    if jsonb_typeof(v_answer) <> 'object'
       or v_answer->>'question_id' is null
       or coalesce(v_answer->>'selected_answer','') not in ('A','B','C','D','E','X')
       or coalesce(v_answer->>'time_spent_seconds','') !~ '^[0-9]{1,6}$' then
      raise exception 'Invalid answer entry' using errcode = '22023';
    end if;
    v_question_id := (v_answer->>'question_id')::uuid;
    v_selected := v_answer->>'selected_answer';
    v_time := (v_answer->>'time_spent_seconds')::integer;
    if v_time > 86400 then raise exception 'Invalid answer time' using errcode = '22023'; end if;

    select esq.option_order, q.correct_answer into v_option_order, v_original_answer
    from public.exam_session_questions esq
    join public.questions q on q.id = esq.question_id
    where esq.session_id = p_session_id and esq.question_id = v_question_id;
    if not found then raise exception 'Answer contains a question outside this exam' using errcode = '22023'; end if;
    if cardinality(v_option_order) not in (4, 5)
       or cardinality(array_positions(v_option_order, 'A')) <> 1
       or cardinality(array_positions(v_option_order, 'B')) <> 1
       or cardinality(array_positions(v_option_order, 'C')) <> 1
       or cardinality(array_positions(v_option_order, 'D')) <> 1
       or cardinality(array_positions(v_option_order, 'E')) <> case when cardinality(v_option_order) = 5 then 1 else 0 end then
      raise exception 'Exam question has an invalid option mapping' using errcode = '22023';
    end if;

    if v_selected <> 'X'
       and array_position(array['A','B','C','D','E']::text[], v_selected) > cardinality(v_option_order) then
      raise exception 'Selected option is not available for this question' using errcode = '22023';
    end if;

    if exists (select 1 from public.user_history uh where uh.session_id = p_session_id and uh.question_id = v_question_id) then
      raise exception 'Duplicate question in submission' using errcode = '22023';
    end if;

    if v_selected = 'X' then
      v_correct := false;
    else
      v_correct := v_option_order[array_position(array['A','B','C','D','E']::text[], v_selected)] = v_original_answer;
    end if;
    if v_correct then v_correct_count := v_correct_count + 1; end if;
    v_answer_count := v_answer_count + 1;

    insert into public.user_history(user_id, question_id, selected_answer, is_correct, time_spent_seconds, session_id)
    values (p_user_id, v_question_id,
      case when v_selected = 'X' then 'X' else v_option_order[array_position(array['A','B','C','D','E']::text[], v_selected)] end,
      v_correct, v_time, p_session_id);

    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'question_id', v_question_id, 'selected_answer', v_selected, 'is_correct', v_correct
    ));
  end loop;

  if v_answer_count <> v_session.total_questions then
    raise exception 'Submission does not match exam question count' using errcode = '22023';
  end if;

  v_elapsed := greatest(0, floor(extract(epoch from (now() - v_session.started_at)))::integer);
  update public.exam_sessions
  set correct_answers = v_correct_count,
      score_percentage = case when total_questions = 0 then 0 else round((v_correct_count::numeric / total_questions) * 100, 2) end,
      duration_seconds = v_elapsed, completed = true, completed_at = now()
  where id = p_session_id and user_id = p_user_id;

  insert into public.user_seen_questions(user_id, question_id)
  select p_user_id, esq.question_id from public.exam_session_questions esq
  where esq.session_id = p_session_id
  on conflict (user_id, question_id) do update set seen_at = now();

  return jsonb_build_object(
    'session_id', p_session_id, 'total_questions', v_session.total_questions,
    'correct_answers', v_correct_count,
    'score_percentage', case when v_session.total_questions = 0 then 0 else round((v_correct_count::numeric / v_session.total_questions) * 100, 2) end,
    'duration_seconds', v_elapsed, 'answers', v_details
  );
end;
$$;
revoke all on function public.submit_cbt_session(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.submit_cbt_session(uuid, uuid, jsonb) to service_role;

alter table private.quiz_room_answer_keys
  drop constraint if exists quiz_room_answer_keys_correct_answer_check;
alter table private.quiz_room_answer_keys
  add constraint quiz_room_answer_keys_correct_answer_check
  check (correct_answer in ('A', 'B', 'C', 'D', 'E'));

alter table public.quiz_answers
  drop constraint if exists quiz_answers_selected_option_check;
alter table public.quiz_answers
  add constraint quiz_answers_selected_option_check
  check (selected_option is null or selected_option in ('A', 'B', 'C', 'D', 'E'));

create or replace function public.live_quiz_submit_answer_internal(
  p_user_id uuid,
  p_room_id uuid,
  p_question_index integer,
  p_selected_option text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.quiz_rooms%rowtype;
  v_key private.quiz_room_answer_keys%rowtype;
  v_question jsonb;
  v_elapsed integer;
  v_selected text;
  v_correct boolean;
  v_points integer;
  v_existing public.quiz_answers%rowtype;
begin
  select * into v_room from public.quiz_rooms where id=p_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'live' or p_question_index <> v_room.current_question_index then
    raise exception 'QUESTION_NOT_ACTIVE';
  end if;
  if not exists(select 1 from public.quiz_participants p where p.room_id=p_room_id and p.user_id=p_user_id) then
    raise exception 'NOT_A_PARTICIPANT';
  end if;

  select * into v_existing from public.quiz_answers
  where room_id=p_room_id and user_id=p_user_id and question_index=p_question_index;
  if found then
    select * into v_key from private.quiz_room_answer_keys
      where room_id=p_room_id and question_index=p_question_index;
    return jsonb_build_object('already_answered',true,'is_correct',v_existing.is_correct,
      'points',v_existing.points_awarded,'correct_answer',v_key.correct_answer,
      'explanation',v_key.explanation,'exam_hint',v_key.exam_hint);
  end if;

  v_elapsed := greatest(0, floor(extract(epoch from (clock_timestamp()-v_room.question_started_at)))::integer);
  v_selected := upper(nullif(trim(p_selected_option),''));
  v_question := v_room.questions -> p_question_index;
  if v_elapsed > v_room.time_per_question then v_selected := null; end if;
  if v_selected not in ('A','B','C','D','E') then v_selected := null; end if;
  if v_selected = 'E' and nullif(btrim(v_question->>'option_e'), '') is null then
    v_selected := null;
  end if;

  select * into v_key from private.quiz_room_answer_keys
  where room_id=p_room_id and question_index=p_question_index;
  if not found then raise exception 'ANSWER_KEY_NOT_FOUND'; end if;

  v_correct := v_selected is not null and v_selected=v_key.correct_answer;
  v_points := case when v_correct then
    10 + greatest(0, floor((v_room.time_per_question-v_elapsed)::numeric / v_room.time_per_question * 5)::integer)
    else 0 end;

  insert into public.quiz_answers(room_id,user_id,question_index,selected_option,time_taken,is_correct,points_awarded)
  values(p_room_id,p_user_id,p_question_index,v_selected,least(v_elapsed,v_room.time_per_question),v_correct,v_points);

  update public.quiz_participants
    set score=score+v_points
    where room_id=p_room_id and user_id=p_user_id;

  if p_user_id=v_room.host_id and v_room.reveal_until is null then
    update public.quiz_rooms set reveal_until=clock_timestamp()+interval '3 seconds', updated_at=now()
      where id=p_room_id;
  end if;

  return jsonb_build_object('already_answered',false,'is_correct',v_correct,'points',v_points,
    'correct_answer',v_key.correct_answer,'explanation',v_key.explanation,'exam_hint',v_key.exam_hint,
    'time_taken',least(v_elapsed,v_room.time_per_question));
end;
$$;

-- Keep the existing service-role-only execution boundary.
revoke all on function public.live_quiz_submit_answer_internal(uuid,uuid,integer,text) from public, anon, authenticated;
grant execute on function public.live_quiz_submit_answer_internal(uuid,uuid,integer,text) to service_role;
