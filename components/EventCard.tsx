import Link from "next/link";
import { CategoryBadge } from "./CategoryBadge";
import { formatWhenShort } from "@/lib/time";
import { spotsTaken } from "@/lib/utils";
import type { EventWithCount } from "@/lib/types";

export function EventCard({ event, past = false }: { event: EventWithCount; past?: boolean }) {
  const left = Math.max(event.max_spots - spotsTaken(event), 0);

  return (
    <Link
      href={`/events/${event.id}`}
      className={`card block p-4 transition hover:border-accent/40 active:scale-[0.99] ${
        past ? "opacity-60" : ""
      }`}
    >
      <CategoryBadge category={event.category} />
      <h3 className="mt-2 text-lg font-semibold leading-snug">{event.title}</h3>
      <p className="mt-1 text-sm font-medium text-accent-dark">
        {formatWhenShort(event.starts_at)}
      </p>
      <p className="mt-0.5 text-sm text-muted">
        {event.neighborhood} · {event.venue_name}
      </p>
      <p className={`mt-3 text-xs font-medium ${left === 0 ? "text-muted" : "text-ink"}`}>
        {left} of {event.max_spots} spots left
      </p>
    </Link>
  );
}
