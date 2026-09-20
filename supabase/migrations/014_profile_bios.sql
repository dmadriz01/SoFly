-- BayMeet: a short bio and optional social usernames, so hosts know who they're letting in.
-- Paste into the SQL editor and run it (after 001-013). It is safe to run again, so if you are
-- unsure whether an earlier run finished, just run it once more.

-- The "about you" a person shares so hosts know who they're letting in: a short bio and optional
-- usernames on social apps. Only the person, and hosts of meetups they've asked to join or joined,
-- can read it. Only usernames are stored (never a pasted link), so a link can only ever point at the
-- app it claims to be, and never at a look-alike site.
create table if not exists public.profile_bios (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  bio         text not null default '' check (char_length(bio) <= 500),
  linkedin    text check (linkedin ~ '^[A-Za-z0-9._-]{1,60}$'),
  instagram   text check (instagram ~ '^[A-Za-z0-9._-]{1,60}$'),
  x_handle    text check (x_handle ~ '^[A-Za-z0-9._-]{1,60}$'),
  tiktok      text check (tiktok ~ '^[A-Za-z0-9._-]{1,60}$'),
  facebook    text check (facebook ~ '^[A-Za-z0-9._-]{1,60}$'),
  updated_at  timestamptz not null default now()
);

-- Is the person asking the host of a meetup that this guest has asked to join or joined?
-- (Cancelling a request deletes the row, so the host loses access again.)
create or replace function private.hosts_guest(guest uuid)
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

alter table public.profile_bios enable row level security;

drop policy if exists "people and their hosts read a bio" on public.profile_bios;
create policy "people and their hosts read a bio"
  on public.profile_bios for select
  to authenticated
  using ((select auth.uid()) = user_id or private.hosts_guest(user_id));

drop policy if exists "people write their own bio" on public.profile_bios;
create policy "people write their own bio"
  on public.profile_bios for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Supabase grants new tables to the API roles by default; take that away, then grant only what
-- is needed (see section 6 of schema.sql).
revoke all on public.profile_bios from anon, authenticated;
grant select on public.profile_bios to authenticated;
grant insert (user_id, bio, linkedin, instagram, x_handle, tiktok, facebook, updated_at),
      update (bio, linkedin, instagram, x_handle, tiktok, facebook, updated_at)
  on public.profile_bios to authenticated;
