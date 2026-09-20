-- BayMeet: devices that turned on push notifications.
-- Paste into the SQL editor and run once (after 001-012). Safe to run before deploying.

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

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "users see and remove their own devices"
  on public.push_subscriptions for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Supabase grants new tables to the API roles by default; take that away, then grant only what
-- is needed (see section 6 of schema.sql). People can read and remove their own devices; adding
-- one is done by the server, which knows who is really asking.
revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;
grant delete on public.push_subscriptions to authenticated;
