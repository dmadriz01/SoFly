import { addDaysToKey, pacificDate } from "./time";

// The numbers on the admin overview, worked out from plain rows so they can be tested without a
// database. (Website visits and page views live in the Vercel dashboard; this is what BayMeet's own
// data can tell you.)

export type ProfileStat = { created_at: string };
export type EventStat = {
  id: string;
  host_id: string;
  category: string;
  neighborhood: string;
  starts_at: string;
  created_at: string;
  cancelled_at: string | null;
  max_spots: number;
  spots_taken: number;
  feedback_yes: number;
  feedback_total: number;
};
export type RsvpStat = { user_id: string; event_id: string; status: string; created_at: string };

export type StatsInput = {
  now: Date;
  profiles: ProfileStat[];
  events: EventStat[];
  rsvps: RsvpStat[];
  reports: { total: number; open: number };
  pushDevices: number;
  /** True when a table was too big to read completely, so the numbers are for the newest rows. */
  truncated: boolean;
};

export type DayPoint = { date: string; members: number; meetups: number; joins: number };
export type Counted = { label: string; count: number };

export type Stats = {
  members: { total: number; last7: number; last30: number; hosted: number; joined: number };
  meetups: { total: number; upcoming: number; held: number; cancelled: number; last7: number; last30: number; upcomingWithNoGuests: number };
  joins: { total: number; last7: number; pendingOnUpcoming: number };
  /** Share of seats filled at meetups that already happened (0-100), or null if there are none yet. */
  fillRate: number | null;
  wouldJoinAgain: { yes: number; total: number; percent: number | null };
  reports: { total: number; open: number };
  pushDevices: number;
  days: DayPoint[];
  topCategories: Counted[];
  topNeighborhoods: Counted[];
  truncated: boolean;
};

const DAY = 24 * 60 * 60 * 1000;
export const CHART_DAYS = 14;

/** The last `n` Pacific calendar days, oldest first, ending today. */
export function lastDays(now: Date, n: number): string[] {
  const today = pacificDate(now);
  return Array.from({ length: n }, (_, i) => addDaysToKey(today, i - (n - 1)));
}

export function topCounts(values: string[], limit = 6): Counted[] {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

const inLast = (iso: string, days: number, now: Date) => {
  const t = new Date(iso).getTime();
  return t <= now.getTime() && now.getTime() - t < days * DAY;
};

export function computeStats(input: StatsInput): Stats {
  const { now, profiles, events, rsvps } = input;
  const hostOf = new Map(events.map((e) => [e.id, e.host_id]));
  const eventById = new Map(events.map((e) => [e.id, e]));
  const isUpcoming = (e: EventStat) => !e.cancelled_at && new Date(e.starts_at) > now;
  const isHeld = (e: EventStat) => !e.cancelled_at && new Date(e.starts_at) <= now;

  // A host's own row (if they have one) isn't someone joining.
  const guestRsvps = rsvps.filter((r) => hostOf.has(r.event_id) && r.user_id !== hostOf.get(r.event_id));
  const approved = guestRsvps.filter((r) => r.status === "approved");

  const upcoming = events.filter(isUpcoming);
  const held = events.filter(isHeld);
  const withGuests = new Set(approved.map((r) => r.event_id));

  const seats = held.reduce((n, e) => n + e.max_spots, 0);
  const taken = held.reduce((n, e) => n + Math.min(e.spots_taken, e.max_spots), 0);
  const yes = events.reduce((n, e) => n + e.feedback_yes, 0);
  const answered = events.reduce((n, e) => n + e.feedback_total, 0);

  const days = lastDays(now, CHART_DAYS);
  const point = new Map<string, DayPoint>(days.map((d) => [d, { date: d, members: 0, meetups: 0, joins: 0 }]));
  const bump = (iso: string, key: "members" | "meetups" | "joins") => {
    const p = point.get(pacificDate(new Date(iso)));
    if (p) p[key] += 1;
  };
  profiles.forEach((p) => bump(p.created_at, "members"));
  events.forEach((e) => bump(e.created_at, "meetups"));
  approved.forEach((r) => bump(r.created_at, "joins"));

  const live = events.filter((e) => !e.cancelled_at);
  return {
    members: {
      total: profiles.length,
      last7: profiles.filter((p) => inLast(p.created_at, 7, now)).length,
      last30: profiles.filter((p) => inLast(p.created_at, 30, now)).length,
      hosted: new Set(events.map((e) => e.host_id)).size,
      joined: new Set(approved.map((r) => r.user_id)).size,
    },
    meetups: {
      total: events.length,
      upcoming: upcoming.length,
      held: held.length,
      cancelled: events.filter((e) => e.cancelled_at).length,
      last7: events.filter((e) => inLast(e.created_at, 7, now)).length,
      last30: events.filter((e) => inLast(e.created_at, 30, now)).length,
      upcomingWithNoGuests: upcoming.filter((e) => !withGuests.has(e.id)).length,
    },
    joins: {
      total: approved.length,
      last7: approved.filter((r) => inLast(r.created_at, 7, now)).length,
      pendingOnUpcoming: guestRsvps.filter((r) => r.status === "pending" && eventById.has(r.event_id) && isUpcoming(eventById.get(r.event_id)!)).length,
    },
    fillRate: seats > 0 ? Math.round((taken / seats) * 100) : null,
    wouldJoinAgain: { yes, total: answered, percent: answered > 0 ? Math.round((yes / answered) * 100) : null },
    reports: input.reports,
    pushDevices: input.pushDevices,
    days: days.map((d) => point.get(d)!),
    topCategories: topCounts(live.map((e) => e.category)),
    topNeighborhoods: topCounts(live.map((e) => e.neighborhood)),
    truncated: input.truncated,
  };
}
