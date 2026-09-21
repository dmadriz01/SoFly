import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// A host's record: how many meetups they've run, how many people came, and how many of those came
// back to a second one. The counts come from the database's host_stats function, which returns
// numbers only, never who. Before migration 019 that function doesn't exist, so callers fall back
// to what the events themselves say (see summarizeHosting).

export type HostRecord = { hosted: number; guests: number; repeatGuests: number };

export async function hostStats(client: SupabaseClient, hostId: string): Promise<HostRecord | null> {
  const { data, error } = await client.rpc("host_stats", { host: hostId });
  if (error || !data) return null;
  const row = (Array.isArray(data) ? data[0] : data) as { hosted?: number; guests?: number; repeat_guests?: number } | undefined;
  if (!row || typeof row.hosted !== "number") return null;
  return { hosted: row.hosted, guests: row.guests ?? 0, repeatGuests: row.repeat_guests ?? 0 };
}
