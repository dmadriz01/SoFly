import Link from "next/link";
import { CategoryBadge } from "./CategoryBadge";
import { ModerateEvent, ReviewReport } from "./AdminButtons";
import type { EventFilter, EventItem, ReportItem } from "@/lib/admin-data";
import { EVENT_FILTERS, EVENT_PAGE } from "@/lib/admin-data";
import type { Counted, DayPoint, Stats } from "@/lib/admin-stats";
import { formatWhenShort } from "@/lib/time";

// The admin screens. They only display what they're given; the page decides who may see them.

export const TABS = [
  { id: "overview", label: "Overview" },
  { id: "reports", label: "Reports" },
  { id: "meetups", label: "Meetups" },
] as const;
export type Tab = (typeof TABS)[number]["id"];

export function AdminTabs({ tab, openReports }: { tab: Tab; openReports: number }) {
  return (
    <nav aria-label="Admin sections" className="flex gap-1.5 overflow-x-auto">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={t.id === "overview" ? "/admin" : `/admin?tab=${t.id}`}
          aria-current={tab === t.id ? "page" : undefined}
          className={`tap whitespace-nowrap rounded-full px-4 text-sm font-medium ${
            tab === t.id ? "bg-accent-soft text-accent-dark" : "text-muted hover:text-ink"
          }`}
        >
          {t.label}
          {t.id === "reports" && openReports > 0 && (
            <span className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 text-xs font-bold text-on-accent">{openReports}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

function Stat({ value, label, sub, href, alert }: { value: string | number; label: string; sub?: string; href?: string; alert?: boolean }) {
  const body = (
    <div className={`card h-full p-4 ${alert ? "border-accent/60 bg-accent-soft" : ""}`}>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      <div className="text-sm font-medium">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function Bars({ title, days, field }: { title: string; days: DayPoint[]; field: "members" | "meetups" | "joins" }) {
  const values = days.map((d) => d[field]);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted">{total} in {days.length} days</span>
      </div>
      <div role="img" aria-label={`${title}, last ${days.length} days: ${days.map((d) => `${d.date} ${d[field]}`).join(", ")}`} className="mt-3 flex h-16 items-end gap-1">
        {days.map((d) => (
          <div key={d.date} title={`${d.date}: ${d[field]}`} className="flex h-full flex-1 items-end">
            <div className={`w-full rounded-sm ${d[field] ? "bg-accent" : "bg-line"}`} style={{ height: `${d[field] ? Math.max((d[field] / max) * 100, 8) : 4}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[0.7rem] text-muted">
        <span>{days[0]?.date.slice(5)}</span>
        <span>today</span>
      </div>
    </div>
  );
}

function TopList({ title, items }: { title: string; items: Counted[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nothing yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((i) => (
            <li key={i.label} className="text-sm">
              <div className="flex justify-between gap-3">
                <span className="truncate">{i.label}</span>
                <span className="text-muted">{i.count}</span>
              </div>
              <div className="mt-0.5 h-1.5 rounded-full bg-line">
                <div className="h-1.5 rounded-full bg-accent" style={{ width: `${(i.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const pct = (n: number | null) => (n === null ? "–" : `${n}%`);
const share = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}% of members` : undefined);

export function OverviewTab({ stats: s }: { stats: Stats }) {
  return (
    <div className="space-y-6">
      {s.truncated && (
        <p className="card border-warn-line bg-warn-soft p-3 text-sm text-warn-strong">
          There is more data than fits on this page, so these numbers cover the newest 10,000 rows of each kind.
        </p>
      )}
      <section aria-labelledby="attention" className="space-y-3">
        <h2 id="attention" className="text-lg font-bold">Needs a look</h2>
        <div className="grid grid-cols-3 gap-3">
          <Stat value={s.reports.open} label="Open reports" href="/admin?tab=reports" alert={s.reports.open > 0} />
          <Stat value={s.joins.pendingOnUpcoming} label="Requests waiting" sub="on upcoming meetups" />
          <Stat value={s.meetups.upcomingWithNoGuests} label="Empty upcoming" sub="nobody has joined" />
        </div>
      </section>

      <section aria-labelledby="totals" className="space-y-3">
        <h2 id="totals" className="text-lg font-bold">Totals</h2>
        <div className="grid grid-cols-2 gap-3">
          <Stat value={s.members.total} label="Members" sub={`+${s.members.last7} this week · +${s.members.last30} this month`} />
          <Stat value={s.meetups.total} label="Meetups posted" sub={`+${s.meetups.last7} this week · +${s.meetups.last30} this month`} />
          <Stat value={s.meetups.upcoming} label="Upcoming meetups" sub={`${s.meetups.held} held · ${s.meetups.cancelled} cancelled`} />
          <Stat value={s.joins.total} label="People joined" sub={`+${s.joins.last7} this week`} />
          <Stat value={s.members.hosted} label="Have hosted" sub={share(s.members.hosted, s.members.total)} />
          <Stat value={s.members.joined} label="Have joined one" sub={share(s.members.joined, s.members.total)} />
          <Stat value={pct(s.fillRate)} label="Seats filled" sub="at meetups that happened" />
          <Stat value={pct(s.wouldJoinAgain.percent)} label="Would join again" sub={s.wouldJoinAgain.total ? `${s.wouldJoinAgain.yes} of ${s.wouldJoinAgain.total} answers` : "no answers yet"} />
          <Stat value={s.pushDevices} label="Push devices" sub="turned on notifications" />
          <Stat value={s.reports.total} label="Reports, all time" />
        </div>
      </section>

      <section aria-labelledby="trend" className="space-y-3">
        <h2 id="trend" className="text-lg font-bold">Last 14 days</h2>
        <Bars title="New members" days={s.days} field="members" />
        <Bars title="New meetups" days={s.days} field="meetups" />
        <Bars title="People joining" days={s.days} field="joins" />
      </section>

      <section aria-labelledby="popular" className="space-y-3">
        <h2 id="popular" className="text-lg font-bold">What people host</h2>
        <TopList title="Categories" items={s.topCategories} />
        <TopList title="Neighborhoods" items={s.topNeighborhoods} />
      </section>

      <p className="text-xs text-muted">
        These come from SoFly&rsquo;s own data. Website visits and page views are in your Vercel dashboard under Analytics.
      </p>
    </div>
  );
}

export function ReportsTab({ reports, showReviewed }: { reports: ReportItem[]; showReviewed: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{showReviewed ? "All reports" : "Open reports"}</h2>
        <Link href={showReviewed ? "/admin?tab=reports" : "/admin?tab=reports&show=all"} className="tap text-sm text-muted underline-offset-2 hover:text-ink hover:underline">
          {showReviewed ? "Hide reviewed" : "Show reviewed too"}
        </Link>
      </div>
      {reports.length === 0 ? (
        <p className="card p-4 text-sm text-muted">{showReviewed ? "No reports yet." : "Nothing open. All reports have been reviewed."}</p>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li key={r.id} className={`card space-y-2 p-4 ${r.reviewedAt ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-semibold text-danger-strong">{r.reason}</span>
                {r.reviewedAt && <span className="rounded-full bg-line px-2.5 py-0.5 text-xs font-semibold text-muted">Reviewed</span>}
                {r.eventCancelled && <span className="rounded-full bg-line px-2.5 py-0.5 text-xs font-semibold text-muted">Cancelled</span>}
                {r.reportsOnEvent > 1 && <span className="text-xs text-muted">{r.reportsOnEvent} reports on this meetup</span>}
              </div>
              <Link href={`/events/${r.eventId}`} className="block font-semibold hover:underline">
                {r.eventTitle}
              </Link>
              {r.details && <p className="whitespace-pre-line break-words text-sm">&ldquo;{r.details}&rdquo;</p>}
              <p className="text-xs text-muted">
                Reported by {r.reporterName} · {formatWhenShort(r.createdAt)} · Host: {r.hostName}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <ModerateEvent eventId={r.eventId} title={r.eventTitle} cancelled={r.eventCancelled} />
                <ReviewReport reportId={r.id} reviewed={Boolean(r.reviewedAt)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const FILTER_LABEL: Record<EventFilter, string> = { upcoming: "Upcoming", past: "Past", cancelled: "Cancelled", all: "All" };

export function MeetupsTab({ events, filter, q, limit }: { events: EventItem[]; filter: EventFilter; q: string; limit: number }) {
  const href = (f: EventFilter, n = EVENT_PAGE) => {
    const p = new URLSearchParams({ tab: "meetups", filter: f });
    if (q) p.set("q", q);
    if (n !== EVENT_PAGE) p.set("n", String(n));
    return `/admin?${p.toString()}`;
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {EVENT_FILTERS.map((f) => (
          <Link key={f} href={href(f)} aria-current={f === filter ? "page" : undefined} className={`tap rounded-full px-4 text-sm font-medium ${f === filter ? "bg-accent-soft text-accent-dark" : "text-muted hover:text-ink"}`}>
            {FILTER_LABEL[f]}
          </Link>
        ))}
      </div>
      <form action="/admin" method="get" className="flex gap-2" role="search">
        <input type="hidden" name="tab" value="meetups" />
        <input type="hidden" name="filter" value={filter} />
        <input name="q" defaultValue={q} maxLength={60} placeholder="Search titles" aria-label="Search meetup titles" className="field" />
        <button type="submit" className="btn-secondary btn !px-4">Search</button>
      </form>
      {events.length === 0 ? (
        <p className="card p-4 text-sm text-muted">{q ? `No ${filter === "all" ? "" : FILTER_LABEL[filter].toLowerCase() + " "}meetups match “${q}”.` : "Nothing here."}</p>
      ) : (
        <ul className="space-y-3">
          {events.map((e) => (
            <li key={e.id} className="card space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <CategoryBadge category={e.category} />
                {e.cancelled && <span className="rounded-full bg-line px-2.5 py-0.5 text-xs font-semibold text-muted">Cancelled</span>}
                {e.openReports > 0 && (
                  <Link href="/admin?tab=reports" className="rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-semibold text-danger-strong">
                    {e.openReports} open {e.openReports === 1 ? "report" : "reports"}
                  </Link>
                )}
                {e.joinMode === "request" && <span className="text-xs text-muted">Approval only</span>}
                {e.audience !== "Everyone" && <span className="text-xs text-muted">{e.audience}</span>}
              </div>
              <Link href={`/events/${e.id}`} className="block font-semibold hover:underline">
                {e.title}
              </Link>
              <p className="text-xs text-muted">
                {formatWhenShort(e.startsAt)} · {e.neighborhood} · Host: {e.hostName} · {e.spotsTaken}/{e.maxSpots} spots
              </p>
              <div className="pt-1">
                <ModerateEvent eventId={e.id} title={e.title} cancelled={e.cancelled} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {events.length >= limit && limit < 300 && (
        <Link href={href(filter, limit + EVENT_PAGE)} className="btn-secondary btn w-full">
          Show more
        </Link>
      )}
    </div>
  );
}
