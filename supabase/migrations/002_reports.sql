-- SoFly: user reports for events.
-- Paste into the Supabase SQL editor and run once (after 001_init.sql).

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  reason       text not null,
  details      text not null default '',
  created_at   timestamptz not null default now(),
  unique (event_id, reporter_id)
);

create index reports_created_at_idx on public.reports (created_at desc);

alter table public.reports enable row level security;

-- Logged-in users can file a report as themselves. There is deliberately NO select,
-- update or delete policy: reports are private, and you read them in the Supabase
-- dashboard (Table Editor -> reports), which bypasses RLS.
create policy "users can report as themselves"
  on public.reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);
