-- SoFly: lets you mark a report as reviewed from the admin page.
-- Paste into the SQL editor and run it (after 001-014). It is safe to run again.

-- When a moderator looked at a report and dealt with it (or decided to leave the event up).
-- Null means still open. The API roles are never granted this column (see section 6 of
-- schema.sql), so only SoFly's server, using its service key, can set it.
alter table public.reports add column if not exists reviewed_at timestamptz;

-- The admin page lists open reports first.
create index if not exists reports_open_idx
  on public.reports (created_at desc)
  where reviewed_at is null;
