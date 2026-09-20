-- ═════════════════════════════════════════════════════════════════════════════
-- BayMeet: complete database schema
--
-- NEW Supabase project?  Paste this whole file into the SQL editor and run it once.
-- Existing database?     Don't. Run only the numbered files in supabase/migrations/ that
--                        you haven't applied yet (see the README).
--
-- This file and the migrations always describe the same final schema. `npm run test:db`
-- builds a database both ways and fails if they differ.
--
-- How access works (read this before changing anything):
--   1. PRIVILEGES (section 6) decide which tables and COLUMNS each API role can touch at all.
--      Everything not granted there is impossible from the API, whatever the policies say.
--   2. ROW LEVEL SECURITY (section 5) decides which ROWS each person can see or change.
--   3. TRIGGERS (section 4) enforce rules that need more than one row: capacity, ages,
--      approvals. They run as the table owner, so they can look at private data.
--   Moderation happens in the Supabase dashboard (SQL editor / table editor), which is not
--   subject to any of the above.
--   New table? Add its indexes, policies AND grants here: Supabase grants new tables to the
--   API roles by default, and section 6 starts by taking that away.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────

-- Public profile: anyone can read it. Created automatically for each new login (section 7).
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default '' check (char_length(name) <= 50),
  created_at  timestamptz not null default now()
);

-- Private profile data. Only the owner can read it. The birthday can't be changed once saved.
create table public.profile_private (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  birth_date  date not null check (birth_date >= date '1900-01-01'),
  created_at  timestamptz not null default now()
);

-- The "about you" a person shares so hosts know who they're letting in: a short bio and optional
-- usernames on social apps. Only the person, and hosts of meetups they've asked to join or joined,
-- can read it. Only usernames are stored (never a pasted link), so a link can only ever point at the
-- app it claims to be, and never at a look-alike site.
create table public.profile_bios (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  bio         text not null default '' check (char_length(bio) <= 500),
  linkedin    text check (linkedin ~ '^[A-Za-z0-9._-]{1,60}$'),
  instagram   text check (instagram ~ '^[A-Za-z0-9._-]{1,60}$'),
  x_handle    text check (x_handle ~ '^[A-Za-z0-9._-]{1,60}$'),
  tiktok      text check (tiktok ~ '^[A-Za-z0-9._-]{1,60}$'),
  facebook    text check (facebook ~ '^[A-Za-z0-9._-]{1,60}$'),
  updated_at  timestamptz not null default now()
);

-- Email preferences. No row means the defaults (everything on). Login codes are always sent.
create table public.user_settings (
  user_id              uuid primary key references public.profiles (id) on delete cascade,
  email_notifications  boolean not null default true,
  updated_at           timestamptz not null default now()
);

-- Categories someone is into. An empty array means "skipped", so we don't ask again.
create table public.user_interests (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  categories  text[] not null default '{}' check (cardinality(categories) <= 30),
  updated_at  timestamptz not null default now()
);

create table public.events (
  id            uuid primary key default gen_random_uuid(),
  host_id       uuid not null references public.profiles (id) on delete cascade,
  title         text not null,
  category      text not null,
  description   text not null default '',
  -- For request-to-join events these two hold a placeholder; the real ones are in event_locations.
  venue_name    text not null,
  address       text not null,
  neighborhood  text not null,
  starts_at     timestamptz not null,
  max_spots     int  not null,
  -- Approved people only. Maintained by a trigger; never written by the API.
  spots_taken   int  not null default 0,
  -- 'open': people join instantly. 'request': the host approves each person.
  join_mode     text not null default 'open' check (join_mode in ('open', 'request')),
  skill_level   text not null default 'All levels'
                  check (skill_level in ('All levels', 'Beginner', 'Intermediate', 'Advanced')),
  audience      text not null default 'Everyone' check (audience in ('Everyone', 'Women-only', 'Men-only')),
  -- Inclusive age range. null/null = anyone 18+ (BayMeet is 18+ only).
  age_min       int,
  age_max       int,
  -- Set by the host (via cancel_event) or a moderator. Only a moderator can clear it.
  cancelled_at  timestamptz,
  -- Guests' "would join again" answers, as running totals. Kept up to date by a trigger; the API
  -- can't write them. (The individual answers are private, see meetup_feedback.)
  feedback_yes    int  not null default 0,
  feedback_total  int  not null default 0,
  created_at    timestamptz not null default now(),

  constraint events_title_length         check (char_length(title) between 1 and 100),
  constraint events_category_length      check (char_length(category) between 1 and 40),
  constraint events_description_length   check (char_length(description) <= 1000),
  constraint events_venue_length         check (char_length(venue_name) between 1 and 100),
  constraint events_address_length       check (char_length(address) between 1 and 200),
  constraint events_neighborhood_length  check (char_length(neighborhood) between 1 and 40),
  constraint events_max_spots_range      check (max_spots between 1 and 200),
  constraint events_spots_within_capacity check (spots_taken between 0 and max_spots),
  constraint events_feedback_within_total check (feedback_yes between 0 and feedback_total),
  constraint events_age_range_check      check (
    (age_min is null or age_min between 18 and 120)
    and (age_max is null or (age_min is not null and age_max >= age_min and age_max <= 120))
  )
);

-- The real venue and address of request-to-join events. Host and approved guests only.
create table public.event_locations (
  event_id    uuid primary key references public.events (id) on delete cascade,
  venue_name  text not null,
  address     text not null,
  created_at  timestamptz not null default now()
);

-- Optional group chat invite link. Host and approved guests only.
create table public.event_chat_links (
  event_id    uuid primary key references public.events (id) on delete cascade,
  url         text not null,
  created_at  timestamptz not null default now(),
  -- Only invite links from known chat apps, so a host can't send guests to a phishing page.
  -- Keep in sync with PLATFORMS in lib/chat.ts.
  constraint event_chat_links_url_check check (
    length(url) <= 500
    and url ~* '^https://([a-z0-9-]+\.)*(chat\.whatsapp\.com|groupme\.com|discord\.gg|discord\.com|t\.me|telegram\.me|signal\.group|join\.slack\.com|m\.me)(/|$)'
  )
);

-- Someone joining an event. For request-to-join events a row starts as 'pending' and the host
-- approves or declines it. The status is set by a trigger, never by the client.
create table public.rsvps (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  status      text not null default 'approved' check (status in ('pending', 'approved', 'declined')),
  created_at  timestamptz not null default now(),
  unique (event_id, user_id)
);

-- The intro someone writes with a join request. Only the host and the author can read it, which
-- is why it isn't a column on rsvps (other approved guests can see rsvps rows).
create table public.rsvp_notes (
  event_id    uuid not null,
  user_id     uuid not null,
  note        text not null check (char_length(note) between 1 and 500),
  created_at  timestamptz not null default now(),
  primary key (event_id, user_id),
  foreign key (event_id, user_id) references public.rsvps (event_id, user_id) on delete cascade
);

-- Events someone swiped left on, so they stop appearing in their swipe deck.
create table public.event_passes (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  event_id    uuid not null references public.events (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, event_id)
);

-- A guest's private answer to "would you join this meetup again?". Only the guest can read their
-- own answer; everyone else sees just the totals on events. No comments, so nothing to moderate.
create table public.meetup_feedback (
  event_id          uuid not null references public.events (id) on delete cascade,
  user_id           uuid not null references public.profiles (id) on delete cascade,
  would_join_again  boolean not null,
  created_at        timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- A device that has turned on push notifications. Added only by the server (which checks who is
-- asking), so a person can see and remove their own devices but never add or edit one.
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  endpoint    text not null unique check (char_length(endpoint) <= 2000),
  p256dh      text not null check (char_length(p256dh) <= 200),
  auth        text not null check (char_length(auth) <= 100),
  created_at  timestamptz not null default now()
);

-- Reports about an event. Write-only from the app; you read them in the dashboard.
create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  reason       text not null check (char_length(reason) between 1 and 100),
  details      text not null default '' check (char_length(details) <= 500),
  created_at   timestamptz not null default now(),
  unique (event_id, reporter_id)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Indexes (primary keys and unique constraints above already have theirs)
-- ─────────────────────────────────────────────────────────────────────────────

create index events_host_id_idx       on public.events (host_id);
-- The feed: upcoming, not cancelled, soonest first.
create index events_upcoming_idx      on public.events (starts_at) where cancelled_at is null;
create index rsvps_event_status_idx   on public.rsvps (event_id, status);
create index rsvps_user_id_idx        on public.rsvps (user_id);
create index event_passes_event_id_idx on public.event_passes (event_id);
create index meetup_feedback_user_id_idx on public.meetup_feedback (user_id);
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
create index reports_reporter_id_idx  on public.reports (reporter_id);
create index reports_created_at_idx   on public.reports (created_at desc);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Helper functions
-- They live in a schema the API doesn't expose, so the only functions callable from the
-- outside are the ones we mean to offer (cancel_event, below). SECURITY DEFINER so a policy
-- on one table can look at another without recursing into that table's own policies.
-- ─────────────────────────────────────────────────────────────────────────────

create schema private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create function private.is_event_host(eid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e where e.id = eid and e.host_id = (select auth.uid())
  );
$$;

create function private.is_approved_attendee(eid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rsvps r
    where r.event_id = eid and r.user_id = (select auth.uid()) and r.status = 'approved'
  );
$$;

create function private.event_is_open(eid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.events e where e.id = eid and e.join_mode = 'open');
$$;

-- Is the person asking the host of a meetup that this guest has asked to join or joined?
-- (Cancelling a request deletes the row, so the host loses access again.)
create function private.hosts_guest(guest uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rsvps r
    join public.events e on e.id = r.event_id
    where r.user_id = guest and e.host_id = (select auth.uid())
  );
$$;

-- The one function we do offer through the API: a host cancelling their own event.
-- (The cancelled_at column itself can't be written from the API, so a host can cancel but
-- can never reinstate. Only a moderator can.)
create function public.cancel_event(eid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.events
  set cancelled_at = now()
  where id = eid and host_id = (select auth.uid()) and cancelled_at is null;

  if not found then
    raise exception 'You can only cancel your own active events';
  end if;
end;
$$;

revoke all on function public.cancel_event(uuid) from public, anon;
grant execute on function public.cancel_event(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Triggers
-- ─────────────────────────────────────────────────────────────────────────────

-- BayMeet is 18+.
create function private.require_adult()
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
  for each row execute function private.require_adult();

-- Joining. Rules that span rows, so they can't be plain constraints: the event must be active
-- and have room, the person needs a completed profile and must meet the age requirement.
-- Also decides the status, so a client can never approve itself. Locking the event row makes
-- concurrent joins for the last spot line up one at a time.
create function private.rsvps_before_insert()
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

  return new;
end;
$$;

create trigger rsvps_before_insert
  before insert on public.rsvps
  for each row execute function private.rsvps_before_insert();

-- A host approving someone must respect capacity. (Who may change which columns is decided by
-- the privileges in section 6: the API can only ever change `status`.)
create function private.rsvps_before_update()
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

create trigger rsvps_before_update
  before update on public.rsvps
  for each row execute function private.rsvps_before_update();

-- Keep events.spots_taken equal to the number of approved RSVPs.
create function private.rsvps_after_change()
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

create trigger rsvps_after_change
  after insert or update or delete on public.rsvps
  for each row execute function private.rsvps_after_change();


-- Feedback: only guests who joined, only once the meetup has started, never the host.
create function private.feedback_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  host_uid  uuid;
  begins    timestamptz;
  cancelled timestamptz;
begin
  select host_id, starts_at, cancelled_at into host_uid, begins, cancelled
  from public.events
  where id = new.event_id;

  if new.user_id = host_uid then
    raise exception 'Hosts can''t rate their own meetup';
  end if;
  if cancelled is not null then
    raise exception 'This meetup was cancelled';
  end if;
  if begins > now() then
    raise exception 'You can give feedback once the meetup has started';
  end if;
  if not exists (
    select 1 from public.rsvps
    where event_id = new.event_id and user_id = new.user_id and status = 'approved'
  ) then
    raise exception 'Only guests who joined can give feedback';
  end if;

  return new;
end;
$$;

create trigger meetup_feedback_before_insert
  before insert on public.meetup_feedback
  for each row execute function private.feedback_before_insert();

-- Keep events.feedback_yes / feedback_total equal to the answers given.
create function private.feedback_after_change()
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
  set feedback_total = (select count(*) from public.meetup_feedback where event_id = eid),
      feedback_yes   = (select count(*) from public.meetup_feedback where event_id = eid and would_join_again)
  where id = eid;

  return null;
end;
$$;

create trigger meetup_feedback_after_change
  after insert or update or delete on public.meetup_feedback
  for each row execute function private.feedback_after_change();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Row level security: which rows each person can see or change
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles         enable row level security;
alter table public.profile_private  enable row level security;
alter table public.user_interests   enable row level security;
alter table public.user_settings    enable row level security;
alter table public.events           enable row level security;
alter table public.event_locations  enable row level security;
alter table public.event_chat_links enable row level security;
alter table public.rsvps            enable row level security;
alter table public.rsvp_notes       enable row level security;
alter table public.event_passes     enable row level security;
alter table public.meetup_feedback  enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.profile_bios     enable row level security;
alter table public.reports          enable row level security;

-- profiles: public to read, editable by their owner.
create policy "profiles are public"
  on public.profiles for select
  using (true);

create policy "users edit their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- profile_private: the owner can read it and add it once.
create policy "users read their own private profile"
  on public.profile_private for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users add their own private profile"
  on public.profile_private for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- user_interests and event_passes: entirely the owner's business.
create policy "users manage their own interests"
  on public.user_interests for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "users manage their own settings"
  on public.user_settings for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "guests manage their own feedback"
  on public.meetup_feedback for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "users see and remove their own devices"
  on public.push_subscriptions for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "people and their hosts read a bio"
  on public.profile_bios for select
  to authenticated
  using ((select auth.uid()) = user_id or private.hosts_guest(user_id));

create policy "people write their own bio"
  on public.profile_bios for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "users manage their own passes"
  on public.event_passes for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- events: public to read. Posting needs a completed profile. Only the host edits or deletes.
create policy "events are public"
  on public.events for select
  using (true);

create policy "hosts with a completed profile post events"
  on public.events for insert
  to authenticated
  with check (
    (select auth.uid()) = host_id
    and exists (select 1 from public.profile_private p where p.user_id = (select auth.uid()))
  );

create policy "hosts edit their own events"
  on public.events for update
  to authenticated
  using ((select auth.uid()) = host_id)
  with check ((select auth.uid()) = host_id);

create policy "hosts delete their own events"
  on public.events for delete
  to authenticated
  using ((select auth.uid()) = host_id);

-- Details only the host and approved guests may see.
create policy "host and approved guests read the location"
  on public.event_locations for select
  to authenticated
  using (private.is_event_host(event_id) or private.is_approved_attendee(event_id));

create policy "host manages the location"
  on public.event_locations for all
  to authenticated
  using (private.is_event_host(event_id))
  with check (private.is_event_host(event_id));

create policy "host and approved guests read the chat link"
  on public.event_chat_links for select
  to authenticated
  using (private.is_event_host(event_id) or private.is_approved_attendee(event_id));

create policy "host manages the chat link"
  on public.event_chat_links for all
  to authenticated
  using (private.is_event_host(event_id))
  with check (private.is_event_host(event_id));

-- rsvps. You always see your own; the host sees every request for their event; everyone else
-- sees approved people only, and on request-to-join events only if they're approved too.
create policy "rsvps follow the event's privacy"
  on public.rsvps for select
  using (
    user_id = (select auth.uid())
    or private.is_event_host(event_id)
    or (
      status = 'approved'
      and (private.event_is_open(event_id) or private.is_approved_attendee(event_id))
    )
  );

create policy "users join as themselves"
  on public.rsvps for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "users leave or cancel their own request"
  on public.rsvps for delete
  to authenticated
  using (user_id = (select auth.uid()));

create policy "hosts approve or decline requests"
  on public.rsvps for update
  to authenticated
  using (private.is_event_host(event_id))
  with check (private.is_event_host(event_id));

create policy "requester and host read a note"
  on public.rsvp_notes for select
  to authenticated
  using (user_id = (select auth.uid()) or private.is_event_host(event_id));

create policy "users write their own note"
  on public.rsvp_notes for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- reports: logged-in users can file one. No read policy: they're for you, in the dashboard.
create policy "users file reports as themselves"
  on public.reports for insert
  to authenticated
  with check (reporter_id = (select auth.uid()));


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Privileges: which tables and columns the API roles can touch at all
-- Start from nothing, then grant only what the app needs. Columns the app never writes
-- (host_id, join_mode, spots_taken, cancelled_at, status on insert, ...) are simply not
-- writable through the API, whatever a client sends.
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on all tables in schema public from anon, authenticated;

-- Public reads (rows are still filtered by the policies above).
grant select on public.profiles, public.events, public.rsvps to anon, authenticated;

-- Reads that need a login.
grant select on
  public.profile_private, public.user_interests, public.user_settings, public.event_passes,
  public.meetup_feedback, public.push_subscriptions, public.profile_bios,
  public.rsvp_notes, public.event_locations, public.event_chat_links
  to authenticated;

-- Writes, column by column where it matters.
grant update (name) on public.profiles to authenticated;
grant insert (user_id, birth_date) on public.profile_private to authenticated;
grant insert (user_id, categories, updated_at), update (categories, updated_at)
  on public.user_interests to authenticated;
grant insert (user_id, email_notifications, updated_at), update (email_notifications, updated_at)
  on public.user_settings to authenticated;
grant insert (user_id, bio, linkedin, instagram, x_handle, tiktok, facebook, updated_at),
      update (bio, linkedin, instagram, x_handle, tiktok, facebook, updated_at)
  on public.profile_bios to authenticated;
grant insert, delete on public.event_passes to authenticated;
grant insert (event_id, user_id, would_join_again), update (would_join_again)
  on public.meetup_feedback to authenticated;
grant delete on public.meetup_feedback to authenticated;
grant delete on public.push_subscriptions to authenticated;

grant insert (host_id, title, category, description, venue_name, address, neighborhood,
              starts_at, max_spots, join_mode, skill_level, audience, age_min, age_max)
  on public.events to authenticated;
grant update (title, category, description, venue_name, address, neighborhood,
              starts_at, max_spots, skill_level, audience, age_min, age_max)
  on public.events to authenticated;
grant delete on public.events to authenticated;

grant insert, update, delete on public.event_locations to authenticated;
grant insert, update, delete on public.event_chat_links to authenticated;

grant insert (event_id, user_id), update (status) on public.rsvps to authenticated;
grant delete on public.rsvps to authenticated;
grant insert (event_id, user_id, note) on public.rsvp_notes to authenticated;
grant insert (event_id, reporter_id, reason, details) on public.reports to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. A profile for every new login
-- ─────────────────────────────────────────────────────────────────────────────

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    left(
      coalesce(
        nullif(new.raw_user_meta_data ->> 'name', ''),
        split_part(coalesce(new.email, ''), '@', 1)
      ),
      50
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
