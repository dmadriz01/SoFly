-- ═════════════════════════════════════════════════════════════════════════════
-- SoFly: complete database schema
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
  -- Which kinds of notification (email and push), and quiet hours (Pacific time) for push.
  notify_reminders     boolean not null default true,
  notify_matches       boolean not null default true,
  notify_activity      boolean not null default true,
  quiet_start          smallint,
  quiet_end            smallint,
  -- The city they browse (see lib/cities.ts). null = the app's first city.
  city                 text,
  updated_at           timestamptz not null default now(),
  constraint user_settings_city_length check (city is null or char_length(city) between 1 and 40),
  constraint user_settings_quiet_hours_check check (
    (quiet_start is null) = (quiet_end is null)
    and (quiet_start is null or quiet_start between 0 and 23)
    and (quiet_end is null or quiet_end between 0 and 23)
  )
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
  -- Inclusive age range. null/null = anyone 18+ (SoFly is 18+ only).
  age_min       int,
  age_max       int,
  -- Set by the host (via cancel_event) or a moderator. Only a moderator can clear it.
  cancelled_at  timestamptz,
  -- Guests' "would join again" answers, as running totals. Kept up to date by a trigger; the API
  -- can't write them. (The individual answers are private, see meetup_feedback.)
  feedback_yes    int  not null default 0,
  feedback_total  int  not null default 0,
  -- When a detail that shapes the cover picture (time, neighborhood, category, skill level, number
  -- of spots) last changed, and what those were before. Kept by a trigger (section 4); the API can't
  -- write them. The meetup page uses them to tell people who joined earlier.
  details_changed_at  timestamptz,
  details_before      jsonb,
  -- Recurring meetups: every date is a normal meetup; a shared series_id ties them together, and
  -- repeat_every (7 or 14 days) says how often. Set only when posting (see the guard trigger).
  series_id     uuid,
  repeat_every  smallint,
  -- Which city (see lib/cities.ts); set when posting, never changed. Meetups from before cities
  -- existed are in the Bay Area, which is the default.
  city          text not null default 'sf-bay-area',
  -- What an "Other sports & fitness" / "Other social & interests" meetup actually is, in the host's words.
  activity      text,
  created_at    timestamptz not null default now(),

  constraint events_title_length         check (char_length(title) between 1 and 100),
  constraint events_category_length      check (char_length(category) between 1 and 40),
  constraint events_description_length   check (char_length(description) <= 1000),
  constraint events_venue_length         check (char_length(venue_name) between 1 and 100),
  constraint events_address_length       check (char_length(address) between 1 and 200),
  constraint events_neighborhood_length  check (char_length(neighborhood) between 1 and 40),
  constraint events_city_length          check (char_length(city) between 1 and 40),
  constraint events_activity_length      check (activity is null or char_length(activity) between 1 and 40),
  constraint events_max_spots_range      check (max_spots between 1 and 200),
  constraint events_spots_within_capacity check (spots_taken between 0 and max_spots),
  constraint events_feedback_within_total check (feedback_yes between 0 and feedback_total),
  constraint events_repeat_every_check   check (repeat_every is null or repeat_every in (7, 14)),
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
  -- Who invited them ("bring a friend"): only a real host or approved guest counts (see the trigger).
  invited_by  uuid references public.profiles (id) on delete set null,
  -- When they answered "still coming?" the day of the meetup.
  confirmed_at timestamptz,
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
  -- When a moderator dealt with it (null = still open). Set only by the server's admin page;
  -- the API roles aren't granted this column.
  reviewed_at  timestamptz,
  unique (event_id, reporter_id)
);


-- People waiting for a spot at a full, open meetup. They're told when one opens.
create table public.event_waitlist (
  event_id    uuid not null references public.events (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- What we've sent, so the daily job never repeats itself and can keep to a limit per person.
-- Only the server (with its service key) can read or write it.
create table public.notification_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (char_length(kind) <= 40),
  ref         text not null default '' check (char_length(ref) <= 100),
  created_at  timestamptz not null default now(),
  unique (user_id, kind, ref)
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
-- The admin page lists open reports first.
create index reports_open_idx         on public.reports (created_at desc) where reviewed_at is null;
create index events_series_idx        on public.events (series_id, starts_at) where series_id is not null;
create index events_city_starts_idx    on public.events (city, starts_at);
create index rsvps_invited_by_idx     on public.rsvps (invited_by) where invited_by is not null;
create index event_waitlist_user_id_idx on public.event_waitlist (user_id);
create index notification_log_user_recent_idx on public.notification_log (user_id, created_at desc);


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

-- A host changing the date/time and place of their own meetup, all in one step (so a meetup can
-- never have its new time but its old place). For approval-only meetups the real venue and address
-- live in event_locations; the public row keeps its placeholder venue and shows the neighborhood as
-- its address, exactly as when the meetup was posted.
create function public.update_event_details(
  eid            uuid,
  new_starts_at  timestamptz,
  new_neighborhood text,
  new_venue      text,
  new_address    text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev record;
begin
  select host_id, join_mode, cancelled_at, starts_at into ev
  from public.events
  where id = eid
  for update;

  if not found or ev.host_id is distinct from (select auth.uid()) then
    raise exception 'You can only edit your own meetups';
  end if;
  if ev.cancelled_at is not null then
    raise exception 'This meetup was cancelled';
  end if;
  if ev.starts_at <= now() then
    raise exception 'This meetup has already started';
  end if;
  if new_starts_at is null or new_starts_at <= now() then
    raise exception 'Pick a time in the future';
  end if;
  if char_length(coalesce(new_neighborhood, '')) not between 1 and 40 then
    raise exception 'Pick a neighborhood';
  end if;
  if char_length(coalesce(new_venue, '')) not between 1 and 100 then
    raise exception 'The venue name must be 1 to 100 characters';
  end if;
  if char_length(coalesce(new_address, '')) not between 1 and 200 then
    raise exception 'The address must be 1 to 200 characters';
  end if;

  if ev.join_mode = 'request' then
    update public.events
    set starts_at = new_starts_at, neighborhood = new_neighborhood, address = new_neighborhood
    where id = eid;

    insert into public.event_locations (event_id, venue_name, address)
    values (eid, new_venue, new_address)
    on conflict (event_id) do update
      set venue_name = excluded.venue_name, address = excluded.address;
  else
    update public.events
    set starts_at = new_starts_at, neighborhood = new_neighborhood, venue_name = new_venue, address = new_address
    where id = eid;
  end if;
end;
$$;

revoke all on function public.update_event_details(uuid, timestamptz, text, text, text) from public, anon;
grant execute on function public.update_event_details(uuid, timestamptz, text, text, text) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Triggers
-- ─────────────────────────────────────────────────────────────────────────────

-- SoFly is 18+.
create function private.require_adult()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.birth_date > (current_date - interval '18 years')::date then
    raise exception 'You must be 18 or older to use SoFly';
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

-- Remember when the details behind a meetup's cover picture change, and what they were before.
create function private.events_track_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.starts_at, new.neighborhood, new.category, new.skill_level, new.max_spots)
     is distinct from
     (old.starts_at, old.neighborhood, old.category, old.skill_level, old.max_spots) then
    new.details_before := jsonb_build_object(
      'starts_at',    old.starts_at,
      'neighborhood', old.neighborhood,
      'category',     old.category,
      'skill_level',  old.skill_level,
      'max_spots',    old.max_spots
    );
    new.details_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger events_track_changes
  before update on public.events
  for each row execute function private.events_track_changes();

-- Recurring meetups: a meetup can only join a series that is the same host's, and a series has a sensible length.
create function private.events_series_guard()
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

create trigger events_series_guard
  before insert on public.events
  for each row execute function private.events_series_guard();

-- The host stops a series: cancel this meetup and every later one in it (never earlier ones).
create function public.cancel_series_from(eid uuid)
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

-- "Still coming?": a guest confirms (leaving already deletes their row).
create function public.confirm_attendance(eid uuid)
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

-- Waitlist: only for open meetups that are full.
create function private.waitlist_before_insert()
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

create trigger event_waitlist_before_insert
  before insert on public.event_waitlist
  for each row execute function private.waitlist_before_insert();

-- Joining takes you off the waitlist.
create function private.rsvps_clear_waitlist()
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

create trigger rsvps_clear_waitlist
  after insert on public.rsvps
  for each row execute function private.rsvps_clear_waitlist();

-- Host record: counts only, never who. (Repeat guests = people who came to 2+ of their meetups.)
create function public.host_stats(host uuid)
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
alter table public.event_waitlist   enable row level security;
alter table public.notification_log enable row level security;

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

-- The waitlist: you see your own place, the host sees who is waiting.
create policy "you and the host see the waitlist"
  on public.event_waitlist for select
  to authenticated
  using (user_id = (select auth.uid()) or private.is_event_host(event_id));

create policy "people join the waitlist as themselves"
  on public.event_waitlist for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "people leave the waitlist"
  on public.event_waitlist for delete
  to authenticated
  using (user_id = (select auth.uid()));

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
grant insert (user_id, email_notifications, notify_reminders, notify_matches, notify_activity,
              quiet_start, quiet_end, city, updated_at),
      update (email_notifications, notify_reminders, notify_matches, notify_activity,
              quiet_start, quiet_end, city, updated_at)
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
              starts_at, max_spots, join_mode, skill_level, audience, age_min, age_max,
              series_id, repeat_every, city, activity)
  on public.events to authenticated;
grant update (title, category, description, venue_name, address, neighborhood,
              starts_at, max_spots, skill_level, audience, age_min, age_max, activity)
  on public.events to authenticated;
grant delete on public.events to authenticated;

grant insert, update, delete on public.event_locations to authenticated;
grant insert, update, delete on public.event_chat_links to authenticated;

grant insert (event_id, user_id, invited_by), update (status) on public.rsvps to authenticated;
grant delete on public.rsvps to authenticated;
grant insert (event_id, user_id, note) on public.rsvp_notes to authenticated;
grant select, delete on public.event_waitlist to authenticated;
grant insert (event_id, user_id) on public.event_waitlist to authenticated;
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
