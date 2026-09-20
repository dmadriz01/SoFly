-- BayMeet: private birthdays, plus skill level / audience / age requirements on events.
-- Paste into the Supabase SQL editor and run once (after 001-004).
--
-- Run this right before deploying the matching code. Once it's in, joining and posting
-- require a completed profile (birthday), which the new code collects at login.

-- ─────────────────────────────────────────────────────────────
-- Events: skill level, audience, age requirement
-- ─────────────────────────────────────────────────────────────

alter table public.events
  add column skill_level text not null default 'All levels',
  add column audience    text not null default 'Everyone',
  add column age_min     int,
  add column age_max     int;

alter table public.events
  add constraint events_skill_level_check
    check (skill_level in ('All levels', 'Beginner', 'Intermediate', 'Advanced')),
  add constraint events_audience_check
    check (audience in ('Everyone', 'Women-only')),
  -- null/null means "anyone 18+" (BayMeet is 18+ only). Ranges are inclusive.
  add constraint events_age_range_check
    check (
      (age_min is null or age_min between 18 and 120)
      and (age_max is null or (age_min is not null and age_max >= age_min and age_max <= 120))
    );

-- ─────────────────────────────────────────────────────────────
-- Private profile data: birthday
-- Kept out of `profiles`, which anyone can read. Only the owner can read this row.
-- ─────────────────────────────────────────────────────────────

create table public.profile_private (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  birth_date  date not null check (birth_date >= date '1900-01-01'),
  created_at  timestamptz not null default now()
);

alter table public.profile_private enable row level security;

create policy "users can read their own private profile"
  on public.profile_private for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users can add their own private profile"
  on public.profile_private for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Deliberately NO update or delete policy: a birthday can't be changed once set, so nobody
-- can edit it to slip into an age-restricted event. If someone made a typo, fix it in the
-- Supabase table editor.

-- BayMeet is 18+.
create or replace function public.require_adult()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.birth_date > (current_date - interval '18 years')::date then
    raise exception 'You must be 18 or older to use BayMeet';
  end if;
  return new;
end;
$$;

create trigger profile_private_require_adult
  before insert or update on public.profile_private
  for each row execute function public.require_adult();

-- ─────────────────────────────────────────────────────────────
-- Posting an event requires a completed profile
-- ─────────────────────────────────────────────────────────────

drop policy "authenticated users can create events they host" on public.events;

create policy "users with a completed profile can create events they host"
  on public.events for insert
  to authenticated
  with check (
    auth.uid() = host_id
    and exists (select 1 from public.profile_private p where p.user_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────
-- Joining an event: profile required, age requirement, not cancelled, not full
-- (replaces the function from 004; the trigger on rsvps already points at it)
-- ─────────────────────────────────────────────────────────────

create or replace function public.enforce_max_spots()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap         int;
  cancelled   timestamptz;
  min_age     int;
  max_age     int;
  event_start timestamptz;
  bday        date;
  joiner_age  int;
  taken       int;
begin
  select max_spots, cancelled_at, age_min, age_max, starts_at
    into cap, cancelled, min_age, max_age, event_start
  from public.events
  where id = new.event_id
  for update;

  if cancelled is not null then
    raise exception 'This event was cancelled';
  end if;

  select birth_date into bday
  from public.profile_private
  where user_id = new.user_id;

  if bday is null then
    raise exception 'Add your birthday to your profile to join';
  end if;

  if min_age is not null or max_age is not null then
    -- Age on the day of the event, in Pacific time.
    joiner_age := extract(
      year from age(
        (event_start at time zone 'America/Los_Angeles')::date::timestamp,
        bday::timestamp
      )
    )::int;

    if (min_age is not null and joiner_age < min_age)
       or (max_age is not null and joiner_age > max_age) then
      raise exception 'You do not meet the age requirement for this event';
    end if;
  end if;

  select count(*) into taken
  from public.rsvps
  where event_id = new.event_id;

  if taken >= cap then
    raise exception 'This event is full';
  end if;

  return new;
end;
$$;
