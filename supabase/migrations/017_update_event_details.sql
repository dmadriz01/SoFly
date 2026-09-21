-- BayMeet: lets a host change the date/time and the place of their own meetup.
-- Paste into the SQL editor and run it (after 001-016). It is safe to run again.

-- One function does the whole edit in a single step, so a meetup can never end up with its new time
-- but its old place. For approval-only meetups the real venue and address live in event_locations
-- (only the host and approved guests can read them); the public row keeps its placeholder venue and
-- shows the neighborhood as its address, exactly as when the meetup was posted.
create or replace function public.update_event_details(
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
