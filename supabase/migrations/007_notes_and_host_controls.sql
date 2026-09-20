-- BayMeet: notes on join requests, and host controls (cancel, change max spots).
-- Paste into the Supabase SQL editor and run once (after 001-006).

-- ─────────────────────────────────────────────────────────────
-- Notes on join requests
-- Kept out of `rsvps`, whose rows other approved guests can see. Only the host and the
-- person who wrote the note can read it. It's deleted with the request.
-- ─────────────────────────────────────────────────────────────

create table public.rsvp_notes (
  event_id    uuid not null,
  user_id     uuid not null,
  note        text not null check (char_length(note) between 1 and 500),
  created_at  timestamptz not null default now(),
  primary key (event_id, user_id),
  foreign key (event_id, user_id) references public.rsvps (event_id, user_id) on delete cascade
);

alter table public.rsvp_notes enable row level security;

create policy "the requester and the host can read a note"
  on public.rsvp_notes for select
  to authenticated
  using (user_id = auth.uid() or public.is_event_host(event_id));

create policy "people can add their own note"
  on public.rsvp_notes for insert
  to authenticated
  with check (user_id = auth.uid());

-- No update or delete policy: to change a note, cancel the request and send a new one
-- (cancelling deletes the request, and the note goes with it).

-- ─────────────────────────────────────────────────────────────
-- Host controls
-- Hosts can now cancel their own event and change its max spots. Reinstating a cancelled
-- event, and the fields the database maintains, stay moderator-only. (Replaces the function
-- from 006. The dashboard and service role are never blocked.)
-- ─────────────────────────────────────────────────────────────

create or replace function public.protect_cancelled_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.cancelled_at is not null or new.spots_taken <> 0 then
        raise exception 'Only moderators can set that';
      end if;

    elsif tg_op = 'UPDATE' then
      -- Cancelling (empty -> set) is fine. Changing or clearing a cancellation is not,
      -- so a host can't undo a moderator's cancellation.
      if new.cancelled_at is distinct from old.cancelled_at
         and not (old.cancelled_at is null and new.cancelled_at is not null) then
        raise exception 'Only moderators can reinstate a cancelled event';
      end if;

      if new.spots_taken is distinct from old.spots_taken
         or new.join_mode is distinct from old.join_mode then
        raise exception 'Only moderators can change that';
      end if;

      if new.max_spots is distinct from old.max_spots then
        if new.max_spots > 200 then
          raise exception 'Max spots can be at most 200';
        end if;
        if new.max_spots < old.spots_taken then
          raise exception 'You already have % people going, so you can''t go below that', old.spots_taken;
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$$;
