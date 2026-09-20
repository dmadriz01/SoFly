import Link from "next/link";
import { AvatarStack, goingSummary } from "./Avatar";
import { CategoryBadge } from "./CategoryBadge";
import { EventTags } from "./EventTags";
import { formatWhenShort } from "@/lib/time";
import { spotsTaken } from "@/lib/utils";
import type { EventWithCount } from "@/lib/types";

export function EventCard({
  event,
  past = false,
  pendingRequests = 0,
  myStatus,
  attendees = [],
}: {
  event: EventWithCount;
  past?: boolean;
  /** Requests waiting on the host (shown on the host's own cards). */
  pendingRequests?: number;
  /** The viewer's own request status, when it isn't simply "going". */
  myStatus?: string;
  /** Names of people going (open events only; approval-only events keep their guest list private). */
  attendees?: string[];
}) {
  const left = Math.max(event.max_spots - spotsTaken(event), 0);
  const cancelled = Boolean(event.cancelled_at);

  return (
    <Link
      href={`/events/${event.id}`}
      className={`card block p-4 transition hover:border-accent/40 active:scale-[0.99] ${
        past || cancelled ? "opacity-60" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <CategoryBadge category={event.category} />
        <EventTags event={event} />
        {pendingRequests > 0 && (
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-white">
            {pendingRequests} {pendingRequests === 1 ? "request" : "requests"} waiting
          </span>
        )}
        {myStatus === "pending" && (
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-dark">
            Requested
          </span>
        )}
        {cancelled && (
          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
            Cancelled
          </span>
        )}
      </div>
      <h3 className={`mt-2 text-lg font-semibold leading-snug ${cancelled ? "line-through" : ""}`}>
        {event.title}
      </h3>
      <p className="mt-1 text-sm font-medium text-accent-dark">
        {formatWhenShort(event.starts_at)}
      </p>
      <p className="mt-0.5 text-sm text-muted">
        {event.neighborhood} · {event.join_mode === "request" ? "Address shared after approval" : event.venue_name}
      </p>
      {!cancelled && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {attendees.length > 0 && (
            <span className="flex items-center gap-2">
              <AvatarStack names={attendees} />
              <span className="text-xs text-muted">{goingSummary(attendees)}</span>
            </span>
          )}
          <span className={`text-xs font-medium ${left === 0 ? "text-muted" : "text-ink"}`}>
            {left === 0 ? "Full" : `${left} of ${event.max_spots} spots left`}
          </span>
        </div>
      )}
    </Link>
  );
}
