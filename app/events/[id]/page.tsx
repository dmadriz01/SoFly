import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryBadge } from "@/components/CategoryBadge";
import { DeleteEventButton } from "@/components/DeleteEventButton";
import { RsvpPanel } from "@/components/RsvpPanel";
import { createClient } from "@/lib/supabase/server";
import { formatWhenLong } from "@/lib/time";
import type { EventRow } from "@/lib/types";
import { firstName } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Detail = EventRow & {
  host: { name: string } | null;
  rsvps: { user_id: string; created_at: string; profiles: { name: string } | null }[];
};

export default async function EventPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data }, userResult] = await Promise.all([
    supabase
      .from("events")
      .select("*, host:profiles!host_id(name), rsvps(user_id, created_at, profiles(name))")
      .eq("id", params.id)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  const event = data as Detail | null;
  if (!event) notFound();

  const user = userResult.data.user;
  const isHost = user?.id === event.host_id;
  const going = event.rsvps.some((r) => r.user_id === user?.id);
  const attendees = [...event.rsvps].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const when = formatWhenLong(event.starts_at);
  const ended = new Date(event.starts_at).getTime() <= Date.now();
  const mapSrc = `https://maps.google.com/maps?q=${encodeURIComponent(event.address)}&output=embed`;

  return (
    <article className="space-y-5">
      <Link href="/" className="text-sm font-medium text-muted hover:text-ink">
        ← All meetups
      </Link>

      <header>
        <CategoryBadge category={event.category} />
        <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight">{event.title}</h1>
        <p className="mt-1 text-sm text-muted">Hosted by {event.host?.name || "someone"}</p>
      </header>

      <div className="card divide-y divide-line">
        <div className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">When</p>
          <p className="mt-0.5 font-semibold">{when.day}</p>
          <p className="text-muted">{when.time}</p>
        </div>
        <div className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Where</p>
          <p className="mt-0.5 font-semibold">{event.venue_name}</p>
          <p className="text-muted">{event.address}</p>
          <p className="text-sm text-muted">{event.neighborhood}</p>
        </div>
      </div>

      <RsvpPanel
        eventId={event.id}
        maxSpots={event.max_spots}
        taken={event.rsvps.length}
        going={going}
        loggedIn={Boolean(user)}
        ended={ended}
      />

      {event.description && (
        <section>
          <h2 className="mb-1.5 text-sm font-semibold">About</h2>
          <p className="whitespace-pre-line text-ink/90">{event.description}</p>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold">
          Who&rsquo;s going ({attendees.length})
        </h2>
        {attendees.length === 0 ? (
          <p className="text-sm text-muted">Nobody yet. Be the first to join.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {attendees.map((r) => (
              <li
                key={r.user_id}
                className="rounded-full border border-line bg-white px-3 py-1 text-sm"
              >
                {firstName(r.profiles?.name)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="card overflow-hidden">
        <iframe
          title={`Map of ${event.venue_name}`}
          src={mapSrc}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="h-64 w-full border-0"
        />
      </div>

      {isHost && <DeleteEventButton eventId={event.id} />}
    </article>
  );
}
