import Link from "next/link";
import { EventCover } from "./EventCover";
import { emojiFor } from "@/lib/constants";
import { formatWhenShort } from "@/lib/time";

/** The one meetup that matters most right now, with what you need to get there. */
export function NextUp({
  id,
  title,
  category,
  neighborhood,
  skill,
  maxSpots,
  startsAt,
  venue,
  address,
  role,
}: {
  id: string;
  title: string;
  category: string;
  neighborhood: string;
  skill: string;
  maxSpots: number;
  startsAt: string;
  venue: string | null;
  address: string | null;
  role: "hosting" | "going";
}) {
  return (
    <section className="fade-up overflow-hidden rounded-3xl bg-accent-soft p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-accent-dark">
        Next up · {role === "hosting" ? "you're hosting" : "you're going"}
      </p>
      <div className="mt-2 flex items-start gap-3">
        <EventCover
          id={id}
          category={category}
          neighborhood={neighborhood}
          startsAt={startsAt}
          skill={skill}
          maxSpots={maxSpots}
          className="h-16 w-16 shrink-0 rounded-2xl text-3xl"
        >
          <span aria-hidden className="leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]">
            {emojiFor(category)}
          </span>
        </EventCover>
        <div className="min-w-0">
          <h2 className="text-xl font-bold leading-tight">{title}</h2>
          <p className="mt-1 font-semibold text-accent-dark">{formatWhenShort(startsAt)}</p>
          {venue && (
            <p className="text-sm text-ink/70">
              {venue}
              {address && address !== venue ? ` · ${address}` : ""}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Link href={`/events/${id}`} className="btn-primary tap !px-2 !py-2 text-sm">
          Open
        </Link>
        <a href={`/events/${id}/calendar.ics`} className="btn-secondary tap !px-2 !py-2 text-sm">
          Calendar
        </a>
        {address ? (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary tap !px-2 !py-2 text-sm"
          >
            Directions
          </a>
        ) : (
          <span />
        )}
      </div>
    </section>
  );
}
