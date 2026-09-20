-- BayMeet: moderator-cancelled events.
-- Paste into the Supabase SQL editor and run once (after 001-003).
-- Safe to run BEFORE deploying the matching code: it only adds a nullable column.

alter table public.events add column cancelled_at timestamptz;

-- Only a moderator can set or clear cancelled_at. Requests from the app run as the
-- `anon` or `authenticated` role, so hosts can't cancel or un-cancel through the API.
-- The Supabase dashboard (SQL editor / table editor) and the service role are not blocked.
create or replace function public.protect_cancelled_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and new.cancelled_at is not null then
      raise exception 'Only moderators can cancel events';
    end if;
    if tg_op = 'UPDATE' and new.cancelled_at is distinct from old.cancelled_at then
      raise exception 'Only moderators can cancel events';
    end if;
  end if;
  return new;
end;
$$;

create trigger events_protect_cancelled_at
  before insert or update on public.events
  for each row execute function public.protect_cancelled_at();

-- Nobody can join a cancelled event (leaving is still allowed).
create or replace function public.enforce_max_spots()
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
  select max_spots, cancelled_at into cap, cancelled
  from public.events
  where id = new.event_id
  for update;

  if cancelled is not null then
    raise exception 'This event was cancelled';
  end if;

  select count(*) into taken
  from public.rsvps
  where event_id = new.event_id;

  if taken >= cap then
    raise exception 'This event is full';
  end if;

  return new;
end;
$$;
