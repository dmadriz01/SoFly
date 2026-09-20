-- BayMeet: let a meetup be set for men only (it already allowed "Everyone" and "Women-only").
-- Paste into the SQL editor and run once (after 001-011).
--
-- Run this BEFORE deploying the matching code: the new form can save "Men-only", and the old rule
-- would refuse it. The old code keeps working after this runs, since the new rule allows a superset.

alter table public.events
  drop constraint events_audience_check,
  add constraint events_audience_check check (audience in ('Everyone', 'Women-only', 'Men-only'));
