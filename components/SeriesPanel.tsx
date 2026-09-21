import Link from "next/link";
import { CancelSeriesButton } from "./CancelSeriesButton";
import { repeatLabel } from "@/lib/recurrence";
import { formatWhenShort } from "@/lib/time";

export type SeriesDate = { id: string; starts_at: string; cancelled_at: string | null; spots_taken: number; max_spots: number };

/** "Part of a weekly series": the other dates, so one meetup becomes a habit. */
export function SeriesPanel({
  currentId,
  dates,
  repeatEvery,
  isHost,
  now = new Date(),
}: {
  currentId: string;
  dates: SeriesDate[];
  repeatEvery: number | null;
  isHost: boolean;
  now?: Date;
}) {
  const upcoming = dates.filter((d) => new Date(d.starts_at) > now);
  if (dates.length < 2) return null;
  const shown = upcoming.slice(0, 6);
  const remaining = upcoming.filter((d) => !d.cancelled_at && new Date(d.starts_at) >= new Date(dates.find((x) => x.id === currentId)?.starts_at ?? 0));

  return (
    <section aria-labelledby="series-heading" className="card space-y-3 p-4">
      <div>
        <h2 id="series-heading" className="text-sm font-semibold">
          {repeatLabel(repeatEvery) ?? "Regular"} series
        </h2>
        <p className="text-xs text-muted">Each date is its own meetup. Join the ones that suit you.</p>
      </div>
      <ul className="divide-y divide-line">
        {shown.map((d) => {
          const left = Math.max(d.max_spots - d.spots_taken, 0);
          return (
            <li key={d.id}>
              <Link
                href={`/events/${d.id}`}
                aria-current={d.id === currentId ? "page" : undefined}
                className={`flex items-center justify-between gap-3 py-2 text-sm ${d.id === currentId ? "font-semibold text-accent" : "text-ink hover:text-accent"}`}
              >
                <span className={d.cancelled_at ? "line-through opacity-60" : ""}>{formatWhenShort(d.starts_at)}</span>
                <span className="text-xs font-medium text-muted">{d.cancelled_at ? "Cancelled" : left === 0 ? "Full" : `${left} left`}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {upcoming.length > shown.length && <p className="text-xs text-muted">+ {upcoming.length - shown.length} more dates</p>}
      {isHost && (
        <div className="space-y-2 border-t border-line pt-3">
          <Link href={`/events/new?from=${currentId}&repeat=${repeatEvery ?? 7}`} className="btn-secondary btn w-full !py-2 text-sm">
            Add more dates
          </Link>
          {remaining.length > 1 && <CancelSeriesButton eventId={currentId} count={remaining.length} />}
        </div>
      )}
    </section>
  );
}
