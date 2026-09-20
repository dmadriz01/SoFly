-- BayMeet: "request to join" events, where the host approves who comes.
-- Paste into the Supabase SQL editor and run once (after 001-005).
--
-- Compatible with the previous version of the app, so run it BEFORE deploying the new code.
--
-- How it works:
--   * events.join_mode: 'open' (join instantly, as before) or 'request' (host approves each person).
--   * rsvps.status: 'pending' | 'approved' | 'declined'. The DATABASE decides the status on insert,
--     so people can't approve themselves.
--   * For 'request' events the real venue and address live in event_locations, readable only by
--     the host and approved people. The public row just says the address is shared after approval.
--   * events.spots_taken counts approved people only, so the feed can show spots left without
--     exposing who's going.

-- ─────────────────────────────────────────────────────────────
-- Columns
-- ─────────────────────────────────────────────────────────────

alter table public.events
  add column join_mode   text not null default 'open'
    check (join_mode in ('open', 'request')),
  add column spots_taken int  not null default 0;

alter table public.rsvps
  add column status text not null default 'approved'
    check (status in ('pending', 'approved', 'declined'));

create index rsvps_event_status_idx on public.rsvps (event_id, status);

-- Existing RSVPs are all approved; fill in the count for existing events.
update public.events e
set spots_taken = (
  select count(*) from public.rsvps r where r.event_id = e.id and r.status = 'approved'
);

-- ─────────────────────────────────────────────────────────────
-- Helpers used by the policies below. SECURITY DEFINER so a policy on `rsvps` can look
-- at `rsvps` without recursing into itself.
-- ─────────────────────────────────────────────────────────────

create or replace function public.is_event_host(eid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e where e.id = eid and e.host_id = auth.uid()
  );
$$;

create or replace function public.is_approved_attendee(eid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rsvps r
    where r.event_id = eid and r.user_id = auth.uid() and r.status = 'approved'
  );
$$;

create or replace function public.event_is_open(eid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e where e.id = eid and e.join_mode = 'open'
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- Private locations for request-to-join events
-- ─────────────────────────────────────────────────────────────

create table public.event_locations (
  event_id    uuid primary key references public.events (id) on delete cascade,
  venue_name  text not null,
  address     text not null,
  created_at  timestamptz not null default now()
);

alter table public.event_locations enable row level security;

create policy "host and approved attendees can read the location"
  on public.event_locations for select
  to authenticated
  using (public.is_event_host(event_id) or public.is_approved_attendee(event_id));

create policy "host can add the location"
  on public.event_locations for insert
  to authenticated
  with check (public.is_event_host(event_id));

create policy "host can change the location"
  on public.event_locations for update
  to authenticated
  using (public.is_event_host(event_id))
  with check (public.is_event_host(event_id));

-- ─────────────────────────────────────────────────────────────
-- Who can see what
-- ─────────────────────────────────────────────────────────────

-- The group chat link is for approved people only (not people with a pending request).
drop policy "host and attendees can read the chat link" on public.event_chat_links;

create policy "host and approved attendees can read the chat link"
  on public.event_chat_links for select
  to authenticated
  using (public.is_event_host(event_id) or public.is_approved_attendee(event_id));

-- RSVPs. You always see your own; the host sees everything for their event; everyone else
-- sees only approved people, and for request-only events only if they're approved too.
drop policy "rsvps are viewable by everyone" on public.rsvps;

create policy "rsvps are visible according to event privacy"
  on public.rsvps for select
  using (
    user_id = auth.uid()
    or public.is_event_host(event_id)
    or (
      status = 'approved'
      and (public.event_is_open(event_id) or public.is_approved_attendee(event_id))
    )
  );

-- Hosts approve or decline requests. (The trigger below limits this to the status column.)
create policy "hosts can approve or decline requests"
  on public.rsvps for update
  to authenticated
  using (public.is_event_host(event_id))
  with check (public.is_event_host(event_id));

-- ─────────────────────────────────────────────────────────────
-- Moderator-only fields on events (extends the trigger from 004)
-- ─────────────────────────────────────────────────────────────

create or replace function public.protect_cancelled_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.cancelled_at is not null or new.spots_taken <> 0 then
        raise exception 'Only moderators can set that';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.cancelled_at is distinct from old.cancelled_at
         or new.spots_taken is distinct from old.spots_taken
         or new.join_mode is distinct from old.join_mode then
        raise exception 'Only moderators can change that';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Joining (replaces the function from 005; the trigger on rsvps already points at it)
-- Profile required, age requirement, not cancelled, not full. Sets the status.
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

  -- The database picks the status; a client can't choose its own. Hosts are always in.
  if mode = 'request' and new.user_id is distinct from host_uid then
    new.status := 'pending';
  else
    new.status := 'approved';
  end if;

  return new;
end;
$$;

-- Approving or declining: only the status may change, and approving respects capacity.
create or replace function public.enforce_rsvp_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap       int;
  cancelled timestamptz;
  taken     int;
begin
  if new.event_id is distinct from old.event_id
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Only the status of a request can be changed';
  end if;

  if new.status = 'approved' and old.status is distinct from 'approved' then
    select max_spots, cancelled_at into cap, cancelled
    from public.events
    where id = new.event_id
    for update;

    if cancelled is not null then
      raise exception 'This event was cancelled';
    end if;

    select count(*) into taken
    from public.rsvps
    where event_id = new.event_id and status = 'approved';

    if taken >= cap then
      raise exception 'This event is full';
    end if;
  end if;

  return new;
end;
$$;

create trigger rsvps_enforce_update
  before update on public.rsvps
  for each row execute function public.enforce_rsvp_update();

-- Keep events.spots_taken in step with approved RSVPs.
create or replace function public.sync_spots_taken()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  eid uuid;
begin
  if tg_op = 'DELETE' then
    eid := old.event_id;
  else
    eid := new.event_id;
  end if;

  update public.events
  set spots_taken = (
    select count(*) from public.rsvps where event_id = eid and status = 'approved'
  )
  where id = eid;

  return null;
end;
$$;

create trigger rsvps_sync_spots_taken
  after insert or update or delete on public.rsvps
  for each row execute function public.sync_spots_taken();
