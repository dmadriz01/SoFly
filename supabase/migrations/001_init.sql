-- BayMeet initial schema.
-- Paste this whole file into the Supabase SQL editor and run it once.

-- ─────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default '',
  created_at  timestamptz not null default now()
);

create table public.events (
  id            uuid primary key default gen_random_uuid(),
  host_id       uuid not null references public.profiles (id) on delete cascade,
  title         text not null,
  category      text not null,
  description   text not null default '',
  venue_name    text not null,
  address       text not null,
  neighborhood  text not null,
  starts_at     timestamptz not null,
  max_spots     int not null check (max_spots > 0),
  created_at    timestamptz not null default now()
);

create table public.rsvps (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (event_id, user_id)
);

create index events_starts_at_idx on public.events (starts_at);
create index events_host_id_idx   on public.events (host_id);
create index rsvps_event_id_idx   on public.rsvps (event_id);
create index rsvps_user_id_idx    on public.rsvps (user_id);

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.events   enable row level security;
alter table public.rsvps    enable row level security;

-- profiles: everyone can read, users can only update their own row.
-- (Rows are created by the trigger below, so there is no INSERT policy.)
create policy "profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- events: public read; authenticated users create events they host;
-- only the host can edit or delete.
create policy "events are viewable by everyone"
  on public.events for select
  using (true);

create policy "authenticated users can create events they host"
  on public.events for insert
  to authenticated
  with check (auth.uid() = host_id);

create policy "hosts can update their own events"
  on public.events for update
  to authenticated
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

create policy "hosts can delete their own events"
  on public.events for delete
  to authenticated
  using (auth.uid() = host_id);

-- rsvps: public read; users can only add/remove their own.
create policy "rsvps are viewable by everyone"
  on public.rsvps for select
  using (true);

create policy "users can rsvp as themselves"
  on public.rsvps for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users can remove their own rsvp"
  on public.rsvps for delete
  to authenticated
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Auto-create a profile for every new auth user
-- ─────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any users who signed up before this migration ran.
insert into public.profiles (id, name)
select id, split_part(coalesce(email, ''), '@', 1)
from auth.users
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────
-- Capacity guard
-- RLS can't express "don't exceed max_spots", so enforce it here.
-- Locking the event row serializes concurrent joins for the same event.
-- ─────────────────────────────────────────────────────────────

create or replace function public.enforce_max_spots()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap   int;
  taken int;
begin
  select max_spots into cap
  from public.events
  where id = new.event_id
  for update;

  select count(*) into taken
  from public.rsvps
  where event_id = new.event_id;

  if taken >= cap then
    raise exception 'This event is full';
  end if;

  return new;
end;
$$;

create trigger rsvps_enforce_max_spots
  before insert on public.rsvps
  for each row execute function public.enforce_max_spots();
