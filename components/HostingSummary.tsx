import Link from "next/link";
import type { HostingSummary as Summary } from "@/lib/engagement";

/** For a host, on Me: the good they've done, in numbers, and a nudge to keep going. */
export function HostingSummary({ summary, lastEventId }: { summary: Summary; lastEventId: string | null }) {
  if (summary.hosted === 0) return null;
  const pct = summary.feedbackTotal >= 3 ? Math.round((summary.feedbackYes / summary.feedbackTotal) * 100) : null;
  const figure = (value: number, label: string) => (
    <div className="min-w-0">
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
  return (
    <section aria-labelledby="hosting-heading" className="card space-y-3 p-4">
      <h2 id="hosting-heading" className="text-sm font-semibold">
        Your hosting
      </h2>
      <div className={`grid gap-3 ${summary.exact ? "grid-cols-3" : "grid-cols-2"}`}>
        {figure(summary.hosted, summary.hosted === 1 ? "meetup hosted" : "meetups hosted")}
        {figure(summary.guests, summary.guests === 1 ? "person came" : "people came")}
        {summary.exact && figure(summary.repeatGuests, summary.repeatGuests === 1 ? "came back" : "came back")}
      </div>
      {pct !== null && (
        <p className="text-sm text-muted">
          {pct}% of guests who answered would join again ({summary.feedbackYes} of {summary.feedbackTotal}).
        </p>
      )}
      {summary.exact && summary.repeatGuests > 0 && (
        <p className="text-sm text-accent-dark">People who come back are the sign of a good meetup. A next date gives them somewhere to go.</p>
      )}
      {lastEventId && (
        <Link href={`/events/new?from=${lastEventId}`} className="btn-secondary btn !py-2 text-sm">
          Post your next one
        </Link>
      )}
    </section>
  );
}
