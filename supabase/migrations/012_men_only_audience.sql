-- BayMeet: let a meetup be set for men only (it already allowed "Everyone" and "Women-only").
-- Paste into the SQL editor and run it (after 001-011). It is safe to run again, so if you are
-- unsure whether an earlier run finished, just run it once more.
-- Run this BEFORE deploying the matching code: the new form can save "Men-only", and the old rule
-- would refuse it. The old code keeps working after this runs, since the new rule allows a superset.

alter table public.events drop constraint if exists events_audience_check;
alter table public.events
  add constraint events_audience_check check (audience in ('Everyone', 'Women-only', 'Men-only'));
