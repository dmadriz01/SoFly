import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeStats, type EventStat, type ProfileStat, type RsvpStat, type Stats } from "./admin-stats";

// Everything the admin page reads. It uses the server-only service key (row level security doesn't
// apply), so ONLY call these after getAdminUser() has said yes. Only names are shown, never emails,
// birthdays, addresses or private notes.

const PAGE = 1000; // Supabase returns at most this many rows per request
const CAP = 10_000; // and we stop here; the overview then says it's based on the newest rows

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function fetchAll<T>(page: (from: number, to: number) => Page<T>): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from < CAP; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

async function count(query: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const { count: n, error } = await query;
  if (error) throw new Error(error.message);
  return n ?? 0;
}

export async function loadStats(admin: SupabaseClient, now = new Date()): Promise<Stats> {
  const [profiles, events, rsvps, reportsTotal, reportsOpen, pushDevices] = await Promise.all([
    fetchAll<ProfileStat & { id: string }>((a, b) =>
      admin.from("profiles").select("id, created_at").order("created_at", { ascending: false }).order("id").range(a, b)
    ),
    fetchAll<EventStat>((a, b) =>
      admin
        .from("events")
        .select("id, host_id, category, neighborhood, starts_at, created_at, cancelled_at, max_spots, spots_taken, feedback_yes, feedback_total")
        .order("created_at", { ascending: false })
        .order("id")
        .range(a, b)
    ),
    fetchAll<RsvpStat & { id: string }>((a, b) =>
      admin.from("rsvps").select("id, user_id, event_id, status, created_at").order("created_at", { ascending: false }).order("id").range(a, b)
    ),
    count(admin.from("reports").select("id", { count: "exact", head: true })),
    count(admin.from("reports").select("id", { count: "exact", head: true }).is("reviewed_at", null)),
    count(admin.from("push_subscriptions").select("id", { count: "exact", head: true })),
  ]);
  // Which meetups belong to a recurring series (migration 019). Best effort: without it every meetup counts as its own post.
  try {
    const series = await fetchAll<{ id: string; series_id: string | null }>((a, b) =>
      admin.from("events").select("id, series_id").not("series_id", "is", null).order("id").range(a, b)
    );
    const seriesOf = new Map(series.rows.map((r) => [r.id, r.series_id]));
    for (const e of events.rows) e.series_id = seriesOf.get(e.id) ?? null;
  } catch {
    // an older database: leave series_id unset
  }
  return computeStats({
    now,
    profiles: profiles.rows,
    events: events.rows,
    rsvps: rsvps.rows,
    reports: { total: reportsTotal, open: reportsOpen },
    pushDevices,
    truncated: profiles.truncated || events.truncated || rsvps.truncated,
  });
}

export async function countOpenReports(admin: SupabaseClient) {
  return count(admin.from("reports").select("id", { count: "exact", head: true }).is("reviewed_at", null));
}

const namesOf = async (admin: SupabaseClient, ids: string[]) => {
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return new Map<string, string>();
  const { data, error } = await admin.from("profiles").select("id, name").in("id", unique);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((p) => [p.id as string, ((p.name as string) || "").trim() || "(no name)"]));
};

export type ReportItem = {
  id: string;
  eventId: string;
  eventTitle: string;
  eventStartsAt: string;
  eventCancelled: boolean;
  hostName: string;
  reporterName: string;
  reason: string;
  details: string;
  createdAt: string;
  reviewedAt: string | null;
  /** How many reports (open or not) this meetup has had. */
  reportsOnEvent: number;
};

export const REPORT_LIMIT = 100;

export async function loadReports(admin: SupabaseClient, opts: { showReviewed: boolean }): Promise<ReportItem[]> {
  let query = admin
    .from("reports")
    .select("id, event_id, reporter_id, reason, details, created_at, reviewed_at")
    .order("created_at", { ascending: false })
    .limit(REPORT_LIMIT);
  if (!opts.showReviewed) query = query.is("reviewed_at", null);
  const { data: reports, error } = await query;
  if (error) throw new Error(error.message);
  if (!reports || reports.length === 0) return [];

  const eventIds = Array.from(new Set(reports.map((r) => r.event_id as string)));
  const [events, allForThose] = await Promise.all([
    admin.from("events").select("id, title, starts_at, cancelled_at, host_id").in("id", eventIds),
    admin.from("reports").select("event_id").in("event_id", eventIds),
  ]);
  if (events.error) throw new Error(events.error.message);
  if (allForThose.error) throw new Error(allForThose.error.message);
  const eventById = new Map((events.data ?? []).map((e) => [e.id as string, e]));
  const perEvent = new Map<string, number>();
  for (const r of allForThose.data ?? []) perEvent.set(r.event_id as string, (perEvent.get(r.event_id as string) ?? 0) + 1);
  const names = await namesOf(admin, [
    ...reports.map((r) => r.reporter_id as string),
    ...(events.data ?? []).map((e) => e.host_id as string),
  ]);

  return reports.map((r) => {
    const e = eventById.get(r.event_id as string);
    return {
      id: r.id as string,
      eventId: r.event_id as string,
      eventTitle: (e?.title as string) ?? "(deleted meetup)",
      eventStartsAt: (e?.starts_at as string) ?? "",
      eventCancelled: Boolean(e?.cancelled_at),
      hostName: e ? names.get(e.host_id as string) ?? "(unknown)" : "(unknown)",
      reporterName: names.get(r.reporter_id as string) ?? "(unknown)",
      reason: r.reason as string,
      details: (r.details as string) ?? "",
      createdAt: r.created_at as string,
      reviewedAt: (r.reviewed_at as string | null) ?? null,
      reportsOnEvent: perEvent.get(r.event_id as string) ?? 1,
    };
  });
}

export const EVENT_FILTERS = ["upcoming", "past", "cancelled", "all"] as const;
export type EventFilter = (typeof EVENT_FILTERS)[number];

/** Makes text safe to put inside an ILIKE pattern: % and _ are wildcards there, \ escapes them. */
export const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

export type EventItem = {
  id: string;
  title: string;
  category: string;
  neighborhood: string;
  startsAt: string;
  cancelled: boolean;
  spotsTaken: number;
  maxSpots: number;
  joinMode: string;
  audience: string;
  hostName: string;
  openReports: number;
};

export const EVENT_PAGE = 50;

export async function loadEvents(
  admin: SupabaseClient,
  opts: { filter: EventFilter; q: string; limit: number; now?: Date }
): Promise<EventItem[]> {
  const nowIso = (opts.now ?? new Date()).toISOString();
  let query = admin
    .from("events")
    .select("id, title, category, neighborhood, starts_at, cancelled_at, spots_taken, max_spots, join_mode, audience, host_id, created_at");
  if (opts.filter === "upcoming") query = query.is("cancelled_at", null).gt("starts_at", nowIso).order("starts_at", { ascending: true });
  else if (opts.filter === "past") query = query.is("cancelled_at", null).lte("starts_at", nowIso).order("starts_at", { ascending: false });
  else if (opts.filter === "cancelled") query = query.not("cancelled_at", "is", null).order("cancelled_at", { ascending: false });
  else query = query.order("created_at", { ascending: false });
  const q = opts.q.trim().slice(0, 60);
  if (q) query = query.ilike("title", `%${escapeLike(q)}%`);
  const { data, error } = await query.order("id").limit(opts.limit);
  if (error) throw new Error(error.message);
  const events = data ?? [];
  if (events.length === 0) return [];

  const ids = events.map((e) => e.id as string);
  const { data: open, error: reportError } = await admin.from("reports").select("event_id").in("event_id", ids).is("reviewed_at", null);
  if (reportError) throw new Error(reportError.message);
  const openBy = new Map<string, number>();
  for (const r of open ?? []) openBy.set(r.event_id as string, (openBy.get(r.event_id as string) ?? 0) + 1);
  const names = await namesOf(admin, events.map((e) => e.host_id as string));

  return events.map((e) => ({
    id: e.id as string,
    title: e.title as string,
    category: e.category as string,
    neighborhood: e.neighborhood as string,
    startsAt: e.starts_at as string,
    cancelled: Boolean(e.cancelled_at),
    spotsTaken: e.spots_taken as number,
    maxSpots: e.max_spots as number,
    joinMode: e.join_mode as string,
    audience: e.audience as string,
    hostName: names.get(e.host_id as string) ?? "(unknown)",
    openReports: openBy.get(e.id as string) ?? 0,
  }));
}
