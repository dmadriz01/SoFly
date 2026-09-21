import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rankMeetups, type Candidate, type Taste } from "./engagement";

// Shared by the weekly digest, the after-meetup recap and the "keep it going" panel: load the
// upcoming meetups once, then pick the best few for one person. Works with either the signed-in
// person's client (what they're allowed to see) or the server's, so the rules are the same everywhere.

/** Upcoming, not-cancelled meetups within `days` (soonest first), as candidates to suggest. */
export async function loadPool(client: SupabaseClient, now: Date, days: number, limit = 300): Promise<Candidate[]> {
  const { data } = await client
    .from("events")
    .select("id, title, category, neighborhood, starts_at, max_spots, spots_taken, audience, age_min, age_max, host_id, series_id")
    .is("cancelled_at", null)
    .gt("starts_at", now.toISOString())
    .lt("starts_at", new Date(now.getTime() + days * 86400000).toISOString())
    .order("starts_at", { ascending: true })
    .limit(limit);
  return (data ?? []).map((e) => ({
    id: e.id as string,
    title: e.title as string,
    category: e.category as string,
    neighborhood: e.neighborhood as string,
    starts_at: e.starts_at as string,
    spots_left: Math.max((e.max_spots as number) - (e.spots_taken as number), 0),
    audience: e.audience as string,
    age_min: (e.age_min as number | null) ?? null,
    age_max: (e.age_max as number | null) ?? null,
    host_id: e.host_id as string,
    series_id: (e.series_id as string | null | undefined) ?? null,
  }));
}

/** The best few meetups from the pool for one person: not ones they've joined or host, and within their age range. */
export async function picksFor(
  client: SupabaseClient,
  userId: string,
  pool: Candidate[],
  taste: Taste,
  opts: { now: Date; withinDays: number; limit: number; alsoExclude?: string[] }
): Promise<Candidate[]> {
  if (pool.length === 0) return [];
  const [mine, priv] = await Promise.all([
    client.from("rsvps").select("event_id").eq("user_id", userId).in("event_id", pool.map((c) => c.id)),
    client.from("profile_private").select("birth_date").eq("user_id", userId).maybeSingle(),
  ]);
  const exclude = new Set<string>([
    ...(mine.data ?? []).map((r) => r.event_id as string),
    ...pool.filter((c) => c.host_id === userId).map((c) => c.id),
    ...(opts.alsoExclude ?? []),
  ]);
  return rankMeetups(pool, taste, {
    now: opts.now,
    withinDays: opts.withinDays,
    exclude,
    birthDate: (priv.data?.birth_date as string | null | undefined) ?? null,
    limit: opts.limit,
  });
}
