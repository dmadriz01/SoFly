-- SoFly: the app's new name in the under-18 error message. Paste into the SQL editor and run it
-- (after 001-017). It is safe to run again. (The app checks ages before it gets here, so people
-- rarely see this message; this just keeps the database in step with the app.)
create or replace function private.require_adult()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.birth_date > (current_date - interval '18 years')::date then
    raise exception 'You must be 18 or older to use SoFly';
  end if;
  return new;
end;
$$;
