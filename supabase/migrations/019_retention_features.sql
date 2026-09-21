-- SoFly: recurring meetups, invites, "still coming?" + waitlist, notification settings and host stats.
-- Paste into the SQL editor and run it (after 001-018). It is safe to run again.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Recurring meetups: each date is a normal meetup; a shared series_id ties them together.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.events
  add column if not exists series_id    uuid,
  add column if not exists repeat_every smallint;

alter table public.events drop constraint if exists events_repeat_every_check;
alter table public.events
  add constraint events_repeat_every_check check (repeat_every is null or repeat_every in (7, 14));

create index if not exists events_series_idx on public.events (series_id, starts_at) where series_id is not null;

-- A meetup can only join a series that is the same host's, and a series has a sensible length.
create or replace function private.events_series_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.series_id is not null then
    if exists (select 1 from public.events e where e.series_id = new.series_id and e.host_id is distinct from new.host_id) then
      raise exception 'That series belongs to someone else';
    end if;
    if (select count(*) from public.events e where e.series_id = new.series_id) >= 26 then
      raise exception 'A series can have at most 26 meetups';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists events_series_guard on public.events;
create trigger events_series_guard
  before insert on public.events
  for each row execute function private.events_series_guard();

-- The host stops a series: cancel this meetup and every later one in it (never earlier ones).
create or replace function public.cancel_series_from(eid uuid)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid    uuid;
  begins timestamptz;
  hid    uuid;
begin
  select series_id, starts_at, host_id into sid, begins, hid
  from public.events
  where id = eid;

  if not found or hid is distinct from (select auth.uid()) then
    raise exception 'You can only cancel your own meetups';
  end if;

  return query
    update public.events
    set cancelled_at = now()
    where host_id = hid
      and cancelled_at is null
      and starts_at > now()
      and (id = eid or (sid is not null and series_id = sid and starts_at >= begins))
    returning id;
end;
$$;

revoke all on function public.cancel_series_from(uuid) from public, anon;
grant execute on function public.cancel_series_from(uuid) to authenticated;

grant insert (series_id, repeat_every) on public.events to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Bring a friend: who invited someone. Only a real host or approved guest counts; anything else
--    is quietly ignored, so an old or made-up link never stops someone from joining.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.rsvps
  add column if not exists invited_by uuid references public.profiles (id) on delete set null;

create index if not exists rsvps_invited_by_idx on public.rsvps (invited_by) where invited_by is not null;

create or replace function private.rsvps_before_insert()
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
  mode        text;
  host_uid    uuid;
  bday        date;
  joiner_age  int;
  taken       int;
begin
  select max_spots, cancelled_at, age_min, age_max, starts_at, join_mode, host_id
    into cap, cancelled, min_age, max_age, event_start, mode, host_uid
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
  where event_id = new.event_id and status = 'approved';

  if taken >= cap then
    raise exception 'This event is full';
  end if;

  -- Hosts are always in; everyone else waits for approval on request-to-join events.
  if mode = 'request' and new.user_id is distinct from host_uid then
    new.status := 'pending';
  else
    new.status := 'approved';
  end if;

  -- Who invited them: the host or an approved guest of this event, and never themselves.
  if new.invited_by is not null then
    if new.invited_by = new.user_id
       or not (
         new.invited_by = host_uid
         or exists (
           select 1 from public.rsvps r
           where r.event_id = new.event_id and r.user_id = new.invited_by and r.status = 'approved'
         )
       ) then
      new.invited_by := null;
    end if;
  end if;

  return new;
end;
$$;

grant insert (invited_by) on public.rsvps to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. "Still coming?": a guest confirms, or frees their spot (leaving already deletes the row).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.rsvps add column if not exists confirmed_at timestamptz;

create or replace function public.confirm_attendance(eid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev record;
begin
  select cancelled_at, starts_at into ev from public.events where id = eid;
  if not found then
    raise exception 'That meetup does not exist';
  end if;
  if ev.cancelled_at is not null then
    raise exception 'This event was cancelled';
  end if;
  if ev.starts_at <= now() then
    raise exception 'This meetup has already started';
  end if;

  update public.rsvps
  set confirmed_at = coalesce(confirmed_at, now())
  where event_id = eid and user_id = (select auth.uid()) and status = 'approved';

  if not found then
    raise exception 'You are not going to this meetup';
  end if;
end;
$$;

revoke all on function public.confirm_attendance(uuid) from public, anon;
grant execute on function public.confirm_attendance(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Waitlist: for open meetups that are full. People are told when a spot opens.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.event_waitlist (
  event_id    uuid not null references public.events (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists event_waitlist_user_id_idx on public.event_waitlist (user_id);

create or replace function private.waitlist_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev    record;
  taken int;
begin
  select host_id, join_mode, cancelled_at, starts_at, max_spots into ev
  from public.events
  where id = new.event_id;

  if not found then
    raise exception 'That meetup does not exist';
  end if;
  if ev.cancelled_at is not null then
    raise exception 'This event was cancelled';
  end if;
  if ev.starts_at <= now() then
    raise exception 'This meetup has already started';
  end if;
  if ev.join_mode <> 'open' then
    raise exception 'The waitlist is only for open meetups';
  end if;
  if ev.host_id = new.user_id then
    raise exception 'You are hosting this meetup';
  end if;
  if exists (select 1 from public.rsvps where event_id = new.event_id and user_id = new.user_id) then
    raise exception 'You have already joined this meetup';
  end if;

  select count(*) into taken from public.rsvps where event_id = new.event_id and status = 'approved';
  if taken < ev.max_spots then
    raise exception 'There are spots left, so you can just join';
  end if;

  return new;
end;
$$;

drop trigger if exists event_waitlist_before_insert on public.event_waitlist;
create trigger event_waitlist_before_insert
  before insert on public.event_waitlist
  for each row execute function private.waitlist_before_insert();

-- Joining takes you off the waitlist.
create or replace function private.rsvps_clear_waitlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.event_waitlist where event_id = new.event_id and user_id = new.user_id;
  return null;
end;
$$;

drop trigger if exists rsvps_clear_waitlist on public.rsvps;
create trigger rsvps_clear_waitlist
  after insert on public.rsvps
  for each row execute function private.rsvps_clear_waitlist();

alter table public.event_waitlist enable row level security;

drop policy if exists "you and the host see the waitlist" on public.event_waitlist;
create policy "you and the host see the waitlist"
  on public.event_waitlist for select
  to authenticated
  using (user_id = (select auth.uid()) or private.is_event_host(event_id));

drop policy if exists "people join the waitlist as themselves" on public.event_waitlist;
create policy "people join the waitlist as themselves"
  on public.event_waitlist for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "people leave the waitlist" on public.event_waitlist;
create policy "people leave the waitlist"
  on public.event_waitlist for delete
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.event_waitlist from anon, authenticated;
grant select, delete on public.event_waitlist to authenticated;
grant insert (event_id, user_id) on public.event_waitlist to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Notification settings (which kinds, and quiet hours) and a server-only send log.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.user_settings
  add column if not exists notify_reminders boolean not null default true,
  add column if not exists notify_matches   boolean not null default true,
  add column if not exists notify_activity  boolean not null default true,
  add column if not exists quiet_start      smallint,
  add column if not exists quiet_end        smallint;

alter table public.user_settings drop constraint if exists user_settings_quiet_hours_check;
alter table public.user_settings
  add constraint user_settings_quiet_hours_check check (
    (quiet_start is null) = (quiet_end is null)
    and (quiet_start is null or quiet_start between 0 and 23)
    and (quiet_end is null or quiet_end between 0 and 23)
  );

grant insert (notify_reminders, notify_matches, notify_activity, quiet_start, quiet_end),
      update (notify_reminders, notify_matches, notify_activity, quiet_start, quiet_end)
  on public.user_settings to authenticated;

-- What we've sent, so the daily job never repeats itself and can keep to a limit per person.
-- Only the server (with its service key) can read or write it.
create table if not exists public.notification_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (char_length(kind) <= 40),
  ref         text not null default '' check (char_length(ref) <= 100),
  created_at  timestamptz not null default now(),
  unique (user_id, kind, ref)
);

create index if not exists notification_log_user_recent_idx on public.notification_log (user_id, created_at desc);

alter table public.notification_log enable row level security;
revoke all on public.notification_log from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Host record: counts only, never who. (Repeat guests = people who came to 2+ of their meetups.)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.host_stats(host uuid)
returns table (hosted int, guests int, repeat_guests int)
language sql
stable
security definer
set search_path = ''
as $$
  with past as (
    select id from public.events
    where host_id = host and cancelled_at is null and starts_at < now()
  ),
  per_guest as (
    select r.user_id, count(*) as n
    from public.rsvps r
    join past on past.id = r.event_id
    where r.status = 'approved' and r.user_id <> host
    group by r.user_id
  )
  select
    (select count(*) from past)::int,
    (select coalesce(sum(n), 0) from per_guest)::int,
    (select count(*) from per_guest where n >= 2)::int;
$$;

revoke all on function public.host_stats(uuid) from public;
grant execute on function public.host_stats(uuid) to anon, authenticated;
