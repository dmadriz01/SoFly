-- SoFly: more than one city, and a name for "Other" activities.
-- Paste into the SQL editor and run it (after 001-019). It is safe to run again.
--
-- Every meetup that already exists is placed in the San Francisco Bay Area (the column's default),
-- so nothing changes for anyone until a second city is added to the app (lib/cities.ts).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Which city a meetup is in, and what an "Other" meetup actually is.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.events
  add column if not exists city     text not null default 'sf-bay-area',
  add column if not exists activity text;

alter table public.events drop constraint if exists events_city_length;
alter table public.events
  add constraint events_city_length check (char_length(city) between 1 and 40);

alter table public.events drop constraint if exists events_activity_length;
alter table public.events
  add constraint events_activity_length check (activity is null or char_length(activity) between 1 and 40);

create index if not exists events_city_starts_idx on public.events (city, starts_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The city a person browses. No value means the app's first city. Private, like their other settings.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.user_settings
  add column if not exists city text;

alter table public.user_settings drop constraint if exists user_settings_city_length;
alter table public.user_settings
  add constraint user_settings_city_length check (city is null or char_length(city) between 1 and 40);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Who can write the new columns. A meetup's city is set when it is posted and never changes.
-- ─────────────────────────────────────────────────────────────────────────────
grant insert (city, activity) on public.events to authenticated;
grant update (activity)       on public.events to authenticated;
grant insert (city), update (city) on public.user_settings to authenticated;
