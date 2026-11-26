create table public.result_share_cards (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 32),
  score integer not null check (score >= 0),
  total_questions integer not null check (total_questions > 0),
  subject text not null check (char_length(subject) between 1 and 100),
  rank_position integer check (rank_position > 0),
  participant_count integer check (participant_count > 0),
  best_score_this_week integer check (best_score_this_week between 0 and 100),
  created_at timestamptz not null default now(),
  check (score <= total_questions),
  check ((rank_position is null) = (participant_count is null)),
  check (rank_position is null or rank_position <= participant_count)
);

alter table public.result_share_cards enable row level security;
revoke all on public.result_share_cards from anon, authenticated;

create or replace function public.create_result_share_card(
  p_first_name text,
  p_score integer,
  p_total_questions integer,
  p_subject text,
  p_rank_position integer,
  p_participant_count integer,
  p_best_score_this_week integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first_name text;
  v_subject text;
  v_token uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to share a quiz result.';
  end if;

  v_first_name := split_part(
    left(regexp_replace(trim(coalesce(p_first_name, '')), '[^[:alpha:] -]', '', 'g'), 32),
    ' ',
    1
  );
  v_subject := left(trim(coalesce(p_subject, '')), 100);

  if trim(coalesce(p_first_name, '')) !~ '^[[:alpha:]][[:alpha:]'' -]{0,31}$'
     or v_first_name = '' or v_subject = ''
     or p_score < 0 or p_total_questions < 1 or p_score > p_total_questions
     or (p_rank_position is null) <> (p_participant_count is null)
     or (p_rank_position is not null and (p_rank_position < 1 or p_participant_count < p_rank_position))
     or (p_best_score_this_week is not null and p_best_score_this_week not between 0 and 100) then
    raise exception 'The quiz result is incomplete or invalid.';
  end if;

  insert into public.result_share_cards (
    user_id, first_name, score, total_questions, subject, rank_position, participant_count, best_score_this_week
  )
  values (
    auth.uid(), v_first_name, p_score, p_total_questions, v_subject,
    p_rank_position, p_participant_count, p_best_score_this_week
  )
  returning token into v_token;

  return v_token;
end;
$$;

revoke all on function public.create_result_share_card(text, integer, integer, text, integer, integer, integer) from public, anon;
grant execute on function public.create_result_share_card(text, integer, integer, text, integer, integer, integer) to authenticated;

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
    'best_score_this_week', c.best_score_this_week
  )
  from public.result_share_cards c
  where c.token = p_token
  limit 1;
$$;

revoke all on function public.get_result_share_card(uuid) from public;
grant execute on function public.get_result_share_card(uuid) to anon, authenticated;

create table public.share_analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null check (event_name in (
    'results_viewed', 'share_clicked', 'link_copied', 'share_card_saved', 'signup_with_referral'
  )),
  app text check (app is null or app in ('whatsapp', 'instagram', 'tiktok')),
  referral_code text,
  source text check (source is null or source in ('link', 'typed')),
  created_at timestamptz not null default now()
);

create index share_analytics_events_created_at_idx on public.share_analytics_events(created_at desc);
create index share_analytics_events_app_created_at_idx on public.share_analytics_events(app, created_at desc);
alter table public.share_analytics_events enable row level security;
revoke all on public.share_analytics_events from anon, authenticated;
grant select, insert on public.share_analytics_events to authenticated;

create policy share_analytics_events_insert_own
  on public.share_analytics_events for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy share_analytics_events_select_own_or_admin
  on public.share_analytics_events for select to authenticated
  using (
    (select auth.uid()) = user_id
    or private.has_role((select auth.uid()), 'admin'::public.app_role)
  );

create or replace function private.log_referral_signup_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_source text;
begin
  v_code := upper(trim(coalesce(new.raw_user_meta_data ->> 'referral_code', '')));
  if v_code = '' then
    return new;
  end if;

  v_source := case
    when new.raw_user_meta_data ->> 'referral_source' = 'link' then 'link'
    else 'typed'
  end;

  insert into public.share_analytics_events(user_id, event_name, referral_code, source)
  values (new.id, 'signup_with_referral', v_code, v_source);

  return new;
end;
$$;

revoke all on function private.log_referral_signup_event() from public, anon, authenticated;

drop trigger if exists on_auth_user_referral_event on auth.users;
create trigger on_auth_user_referral_event
  after insert on auth.users
  for each row execute function private.log_referral_signup_event();
