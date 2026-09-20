-- BayMeet: people's interests (to suggest events) and swiped-away events.
-- Paste into the Supabase SQL editor and run once (after 001-007).
-- Safe to run before deploying the matching code.

-- Which categories someone is into. An empty array means "skipped", so we don't ask again.
create table public.user_interests (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  categories  text[] not null default '{}' check (cardinality(categories) <= 30),
  updated_at  timestamptz not null default now()
);

alter table public.user_interests enable row level security;

create policy "users can read their own interests"
  on public.user_interests for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users can add their own interests"
  on public.user_interests for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users can change their own interests"
  on public.user_interests for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Events someone swiped left on, so they stop showing up in their swipe deck.
create table public.event_passes (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  event_id    uuid not null references public.events (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, event_id)
);

alter table public.event_passes enable row level security;

create policy "users can read their own passes"
  on public.event_passes for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users can pass on events"
  on public.event_passes for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users can undo a pass"
  on public.event_passes for delete
  to authenticated
  using (auth.uid() = user_id);
