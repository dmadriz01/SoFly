-- BayMeet: guests' private "would you join again?" feedback, shown publicly only as totals.
-- Paste into the SQL editor and run once (after 001-010). Safe to run before deploying.

alter table public.events
  add column feedback_yes   int not null default 0,
  add column feedback_total int not null default 0,
  add constraint events_feedback_within_total check (feedback_yes between 0 and feedback_total);

-- A guest's private answer to "would you join this meetup again?". Only the guest can read their
-- own answer; everyone else sees just the totals on events. No comments, so nothing to moderate.
create table public.meetup_feedback (
  event_id          uuid not null references public.events (id) on delete cascade,
  user_id           uuid not null references public.profiles (id) on delete cascade,
  would_join_again  boolean not null,
  created_at        timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index meetup_feedback_user_id_idx on public.meetup_feedback (user_id);

-- Feedback: only guests who joined, only once the meetup has started, never the host.
create function private.feedback_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  host_uid  uuid;
  begins    timestamptz;
  cancelled timestamptz;
begin
  select host_id, starts_at, cancelled_at into host_uid, begins, cancelled
  from public.events
  where id = new.event_id;

  if new.user_id = host_uid then
    raise exception 'Hosts can''t rate their own meetup';
  end if;
  if cancelled is not null then
    raise exception 'This meetup was cancelled';
  end if;
  if begins > now() then
    raise exception 'You can give feedback once the meetup has started';
  end if;
  if not exists (
    select 1 from public.rsvps
    where event_id = new.event_id and user_id = new.user_id and status = 'approved'
  ) then
    raise exception 'Only guests who joined can give feedback';
  end if;

  return new;
end;
$$;

create trigger meetup_feedback_before_insert
  before insert on public.meetup_feedback
  for each row execute function private.feedback_before_insert();

-- Keep events.feedback_yes / feedback_total equal to the answers given.
create function private.feedback_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  eid uuid;
begin
  if tg_op = 'DELETE' then
    eid := old.event_id;
  else
    eid := new.event_id;
  end if;

  update public.events
  set feedback_total = (select count(*) from public.meetup_feedback where event_id = eid),
      feedback_yes   = (select count(*) from public.meetup_feedback where event_id = eid and would_join_again)
  where id = eid;

  return null;
end;
$$;

create trigger meetup_feedback_after_change
  after insert or update or delete on public.meetup_feedback
  for each row execute function private.feedback_after_change();

alter table public.meetup_feedback enable row level security;

create policy "guests manage their own feedback"
  on public.meetup_feedback for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Supabase grants new tables to the API roles by default; take that away, then grant only what
-- is needed (see section 6 of schema.sql).
revoke all on public.meetup_feedback from anon, authenticated;
grant select on public.meetup_feedback to authenticated;
grant insert (event_id, user_id, would_join_again), update (would_join_again)
  on public.meetup_feedback to authenticated;
grant delete on public.meetup_feedback to authenticated;
