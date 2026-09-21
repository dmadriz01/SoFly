import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_CITY_ID, cityOrDefault, isMultiCity } from "./cities";
import { rankMeetups, type Candidate, type Taste } from "./engagement";

// Shared by the weekly digest, the after-meetup recap and the "keep it going" panel: load the
// upcoming meetups once, then pick the best few for one person. Works with either the signed-in
// person's client (what they're allowed to see) or the server's, so the rules are the same everywhere.

/**
 * Upcoming, not-cancelled meetups within `days` (soonest first), as candidates to suggest. With several
 * cities, `city` keeps them to that one; with one city there is nothing to filter, and the query is
 * exactly what it was before cities existed.
 */
export async function loadPool(client: SupabaseClient, now: Date, days: number, limit = 300, city?: string): Promise<Candidate[]> {
  let query = client
    .from("events")
    .select("id, title, category, neighborhood, starts_at, max_spots, spots_taken, audience, age_min, age_max, host_id, series_id")
    .is("cancelled_at", null)
    .gt("starts_at", now.toISOString())
    .lt("starts_at", new Date(now.getTime() + days * 86400000).toISOString());
  if (city && isMultiCity()) query = query.eq("city", cityOrDefault(city).id);
  const { data } = await query.order("starts_at", { ascending: true }).limit(limit);
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

/** The city a person browses (their saved choice), or the first city. Never queries in a one-city app. */
export async function cityOfUser(client: SupabaseClient, userId: string): Promise<string> {
  if (!isMultiCity()) return DEFAULT_CITY_ID;
  const { data } = await client.from("user_settings").select("city").eq("user_id", userId).maybeSingle();
  return cityOrDefault(data?.city).id;
}

/** The city a meetup is in. Never queries in a one-city app. */
export async function cityOfEvent(client: SupabaseClient, eventId: string): Promise<string> {
  if (!isMultiCity()) return DEFAULT_CITY_ID;
  const { data } = await client.from("events").select("city").eq("id", eventId).maybeSingle();
  return cityOrDefault(data?.city).id;
}
