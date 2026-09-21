-- BayMeet: remembers when a detail that shapes a meetup's cover picture last changed, and what it
-- was before, so people who already joined can be told on the meetup page.
-- Paste into the SQL editor and run it (after 001-015). It is safe to run again.

-- The details that shape the picture: time, neighborhood, category, skill level, number of spots.
-- Both columns are kept by the trigger below. They are not in the API's column grants (section 6 of
-- schema.sql), so nobody can write them directly. They only ever hold values that were already public.
alter table public.events
  add column if not exists details_changed_at timestamptz,
  add column if not exists details_before     jsonb;

create or replace function private.events_track_changes()
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

drop trigger if exists events_track_changes on public.events;
create trigger events_track_changes
  before update on public.events
  for each row execute function private.events_track_changes();
