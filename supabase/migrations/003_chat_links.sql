-- SoFly: optional group chat link per event, visible only to the host and people who joined.
-- Paste into the Supabase SQL editor and run once (after 001 and 002).

create table public.event_chat_links (
  event_id    uuid primary key references public.events (id) on delete cascade,
  url         text not null,
  created_at  timestamptz not null default now(),
  -- Only invite links from known chat apps, so a host can't send attendees to a phishing page.
  -- Keep in sync with PLATFORMS in lib/chat.ts.
  constraint event_chat_links_url_check check (
    length(url) <= 500
    and url ~* '^https://([a-z0-9-]+\.)*(chat\.whatsapp\.com|groupme\.com|discord\.gg|discord\.com|t\.me|telegram\.me|signal\.group|join\.slack\.com|m\.me)(/|$)'
  )
);

alter table public.event_chat_links enable row level security;

-- Readable only by the event's host and by people who have joined it.
create policy "host and attendees can read the chat link"
  on public.event_chat_links for select
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_chat_links.event_id and e.host_id = auth.uid()
    )
    or exists (
      select 1 from public.rsvps r
      where r.event_id = event_chat_links.event_id and r.user_id = auth.uid()
    )
  );

-- Only the host can add, change or remove it.
create policy "host can add the chat link"
  on public.event_chat_links for insert
  to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_chat_links.event_id and e.host_id = auth.uid()
    )
  );

create policy "host can change the chat link"
  on public.event_chat_links for update
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_chat_links.event_id and e.host_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_chat_links.event_id and e.host_id = auth.uid()
    )
  );

create policy "host can remove the chat link"
  on public.event_chat_links for delete
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_chat_links.event_id and e.host_id = auth.uid()
    )
  );
