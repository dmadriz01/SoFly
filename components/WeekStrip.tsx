import Link from "next/link";
import { feedHref, type FeedFilters } from "@/lib/feed";
import { addDaysToKey } from "@/lib/time";
import { WEEKS_AHEAD, dayLabel, weekDays, weekRangeLabel, weekStartKey } from "@/lib/weeks";

/**
 * Browse meetups by time: a week at a time, or a single day. Days show how many meetups are on.
 * Everything is a plain link, so the selection lives in the address and can be shared.
 */
export function WeekStrip({
  filters,
  today,
  shownWeek,
  counts,
}: {
  filters: FeedFilters;
  /** Today's Pacific date, YYYY-MM-DD. */
  today: string;
  /** The Monday of the week on screen. */
  shownWeek: string;
  /** Meetups per day for the week on screen, keyed by YYYY-MM-DD. */
  counts: Record<string, number>;
}) {
  const thisWeek = weekStartKey(today);
  const lastWeek = addDaysToKey(thisWeek, 7 * WEEKS_AHEAD);
  const canGoBack = shownWeek > thisWeek;
  const canGoForward = shownWeek < lastWeek;
  const base: FeedFilters = { ...filters, week: undefined, day: undefined };
  const filtering = Boolean(filters.week || filters.day);

  const summary = filters.day ? dayLabel(filters.day) : filters.week ? `Week of ${weekRangeLabel(filters.week)}` : "All upcoming";
  const arrow =
    "tap w-11 rounded-full border border-line bg-white text-lg text-ink transition hover:border-accent/50";

  return (
    <section aria-label="Browse by date" className="card space-y-3 p-3">
      <div className="flex items-center justify-between gap-2">
        {canGoBack ? (
          <Link href={feedHref({ ...base, week: addDaysToKey(shownWeek, -7) })} aria-label="Previous week" className={arrow}>
            ‹
          </Link>
        ) : (
          <span aria-hidden className={`${arrow} opacity-30`}>
            ‹
          </span>
        )}
        <p className="text-sm font-semibold" aria-live="polite">
          {weekRangeLabel(shownWeek)}
        </p>
        {canGoForward ? (
          <Link href={feedHref({ ...base, week: addDaysToKey(shownWeek, 7) })} aria-label="Next week" className={arrow}>
            ›
          </Link>
        ) : (
          <span aria-hidden className={`${arrow} opacity-30`}>
            ›
          </span>
        )}
      </div>

      <ul className="grid grid-cols-7 gap-1">
        {weekDays(shownWeek).map((d) => {
          const past = d.key < today;
          const selected = filters.day === d.key;
          const n = counts[d.key] ?? 0;
          const cell = `flex min-h-[3.5rem] flex-col items-center justify-center rounded-xl text-center transition ${
            selected
              ? "bg-accent text-white"
              : d.key === today
                ? "border border-accent/60 bg-white text-ink"
                : "bg-white text-ink hover:bg-accent-soft"
          }`;
          const inner = (
            <>
              <span className={`text-[0.65rem] font-medium uppercase ${selected ? "text-white/80" : "text-muted"}`}>{d.name}</span>
              <span className="text-base font-bold leading-tight">{d.day}</span>
              <span className="flex h-2 items-center gap-0.5" aria-hidden>
                {Array.from({ length: Math.min(n, 3) }, (_, i) => (
                  <span key={i} className={`h-1 w-1 rounded-full ${selected ? "bg-white" : "bg-accent"}`} />
                ))}
              </span>
            </>
          );
          return (
            <li key={d.key}>
              {past ? (
                <span aria-hidden className={`${cell} opacity-30`}>
                  {inner}
                </span>
              ) : (
                <Link
                  // Tapping the chosen day again goes back to the whole week.
                  href={feedHref({ ...base, week: shownWeek, day: selected ? undefined : d.key })}
                  aria-pressed={selected}
                  aria-label={`${dayLabel(d.key)}: ${n === 0 ? "no meetups" : `${n} ${n === 1 ? "meetup" : "meetups"}`}`}
                  className={cell}
                >
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between gap-2 text-sm">
        <p className="text-muted">
          Showing <span className="font-semibold text-ink">{summary}</span>
        </p>
        <span className="flex gap-1">
          {(filters.week !== thisWeek || filters.day) && (
            <Link href={feedHref({ ...base, week: thisWeek })} className="tap px-2 font-medium text-accent-dark underline">
              This week
            </Link>
          )}
          {filtering && (
            <Link href={feedHref(base)} className="tap px-2 font-medium text-accent-dark underline">
              All upcoming
            </Link>
          )}
        </span>
      </div>
    </section>
  );
}
