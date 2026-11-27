-- Validate shared result cards against completed, server-recorded quiz results.
-- The browser may request a share card, but it cannot choose the score or rank.

create or replace function public.create_result_share_card(
  p_first_name text,
  p_score integer,
  p_total_questions integer,
  p_subject text,
  p_rank_position integer,
  p_participant_count integer,
  p_best_score_this_week integer,
  p_result_id uuid,
  p_is_solo boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first_name text;
  v_subject text;
  v_expected_subject text;
  v_token uuid;
  v_correct integer;
  v_total integer;
  v_rank integer;
  v_participants integer;
  v_session public.exam_sessions%rowtype;
  v_room public.quiz_rooms%rowtype;
  v_participant public.quiz_participants%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to share a quiz result.';
  end if;

  if p_first_name is null
     or p_score is null
     or p_total_questions is null
     or p_subject is null
     or p_is_solo is null
     or p_result_id is null
     or p_score < 0
     or p_total_questions < 1
     or p_score > p_total_questions
     or p_best_score_this_week is not null then
    raise exception 'The quiz result is incomplete or invalid.';
  end if;

  v_first_name := split_part(
    left(regexp_replace(trim(coalesce(p_first_name, '')), '[^[:alpha:] -]', '', 'g'), 32),
    ' ',
    1
  );

  if trim(coalesce(p_first_name, '')) !~ '^[[:alpha:]][[:alpha:]'' -]{0,31}$'
     or v_first_name = '' then
    raise exception 'Enter a valid first name.';
  end if;

  if p_is_solo then
    select *
      into v_session
      from public.exam_sessions
     where id = p_result_id
       and user_id = auth.uid()
       and completed = true;

    if not found then
      raise exception 'Completed exam result not found.';
    end if;

    v_correct := v_session.correct_answers;
    v_total := v_session.total_questions;

    v_expected_subject := concat_ws(
      ' — ',
      nullif(concat_ws(
        ' ',
        nullif(v_session.examination, ''),
        case when v_session.exam_year is not null then v_session.exam_year::text end
      ), ''),
      nullif(array_to_string(v_session.subjects, ' · '), '')
    );

    if v_expected_subject = '' then
      v_expected_subject := 'Practice';
    end if;

    if p_rank_position is not null or p_participant_count is not null then
      raise exception 'Solo results cannot include a live quiz rank.';
    end if;
  else
    select *
      into v_room
      from public.quiz_rooms
     where id = p_result_id
       and status = 'ended';

    if not found then
      raise exception 'Completed live quiz not found.';
    end if;

    select *
      into v_participant
      from public.quiz_participants
     where room_id = p_result_id
       and user_id = auth.uid();

    if not found then
      raise exception 'You did not participate in this quiz.';
    end if;

    select count(*) filter (where is_correct)
      into v_correct
      from public.quiz_answers
     where room_id = p_result_id
       and user_id = auth.uid();

    -- The quiz's configured question count is authoritative, including questions
    -- the participant timed out on or did not answer.
    v_total := v_room.num_questions;

    select count(*),
           1 + count(*) filter (
             where other.score > v_participant.score
                or (other.score = v_participant.score and other.joined_at < v_participant.joined_at)
           )
      into v_participants, v_rank
      from public.quiz_participants other
     where other.room_id = p_result_id;

    v_expected_subject := case
      when v_room.quiz_type = 'examination' and v_room.examination is not null
        then v_room.examination
          || case when v_room.exam_year is not null then ' ' || v_room.exam_year::text else '' end
          || ' · ' || v_room.subject
      else 'General quiz · ' || v_room.subject
    end;

    if p_rank_position is distinct from v_rank
       or p_participant_count is distinct from v_participants then
      raise exception 'Live quiz ranking does not match the recorded results.';
    end if;
  end if;

  if p_score is distinct from v_correct
     or p_total_questions is distinct from v_total
     or p_subject is distinct from v_expected_subject
     or v_total < 1
     or v_correct > v_total then
    raise exception 'The shared score does not match the completed quiz result.';
  end if;

  v_subject := left(trim(v_expected_subject), 100);

  insert into public.result_share_cards (
    user_id, first_name, score, total_questions, subject,
    rank_position, participant_count, best_score_this_week
  )
  values (
    auth.uid(), v_first_name, v_correct, v_total, v_subject,
    case when p_is_solo then null else v_rank end,
    case when p_is_solo then null else v_participants end,
    null
  )
  returning token into v_token;

  return v_token;
end;
$$;

revoke all on function public.create_result_share_card(text, integer, integer, text, integer, integer, integer) from public, anon, authenticated;
drop function if exists public.create_result_share_card(text, integer, integer, text, integer, integer, integer);

revoke all on function public.create_result_share_card(text, integer, integer, text, integer, integer, integer, uuid, boolean) from public, anon;
grant execute on function public.create_result_share_card(text, integer, integer, text, integer, integer, integer, uuid, boolean) to authenticated;

-- Bind public share attribution to the owner of the result card.
-- The referral code is already public; returning it here prevents URL tampering.
create or replace function public.get_result_share_card(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'first_name', c.first_name,
    'score', c.score,
    'total_questions', c.total_questions,
    'subject', c.subject,
    'rank_position', c.rank_position,
    'participant_count', c.participant_count,
    'best_score_this_week', c.best_score_this_week,
    'referral_code', rp.referral_code
  )
  from public.result_share_cards c
  left join public.referral_profiles rp on rp.user_id = c.user_id
  where c.token = p_token
  limit 1;
$$;

revoke all on function public.get_result_share_card(uuid) from public;
grant execute on function public.get_result_share_card(uuid) to anon, authenticated;
