-- BayMeet: email notification preferences.
-- Paste into the SQL editor and run once (after 001-009). Safe to run before deploying.

-- Email preferences. No row means the defaults (everything on). Login codes are always sent.
create table public.user_settings (
  user_id              uuid primary key references public.profiles (id) on delete cascade,
  email_notifications  boolean not null default true,
  updated_at           timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "users manage their own settings"
  on public.user_settings for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Supabase grants new tables to the API roles by default; take that away, then grant only what
-- is needed (see section 6 of schema.sql). Signed-in people can read their own row and change
-- only the on/off switch.
revoke all on public.user_settings from anon, authenticated;
grant select on public.user_settings to authenticated;
grant insert (user_id, email_notifications, updated_at), update (email_notifications, updated_at)
  on public.user_settings to authenticated;
