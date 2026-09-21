import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DIGEST_MIN_GAP_DAYS, NUDGE_KINDS, NUDGE_PUSH_CAP_PER_DAY } from "./notify-policy";

// The send log (public.notification_log, server-only). It does two jobs: it makes the daily job
// safe to run twice (each message is claimed before it is sent), and it lets us keep nudges to a
// few a day per person. If the table isn't there yet (migration 019 not run) nothing new is sent,
// rather than risking sending it again and again.

const DAY = 24 * 60 * 60 * 1000;

/** Claims one message for one person. True means it's yours to send; false means it was already sent (or the log is unavailable). */
export async function claimSend(admin: SupabaseClient, userId: string, kind: string, ref: string): Promise<boolean> {
  const { error } = await admin.from("notification_log").insert({ user_id: userId, kind, ref });
  if (!error) return true;
  if (error.code === "23505") return false; // already sent
  console.error("Send log unavailable, so this message was not sent (run supabase/migrations/019_retention_features.sql):", error.message);
  return false;
}

/** How many nudges this person was sent in the last 24 hours. */
export async function nudgesToday(admin: SupabaseClient, userId: string, now = new Date()): Promise<number> {
  const { count, error } = await admin
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("kind", [...NUDGE_KINDS])
    .gte("created_at", new Date(now.getTime() - DAY).toISOString());
  return error ? 0 : count ?? 0;
}

export const underNudgeCap = async (admin: SupabaseClient, userId: string, now = new Date()) =>
  (await nudgesToday(admin, userId, now)) < NUDGE_PUSH_CAP_PER_DAY;

/** Whether a digest went to this person recently. */
export async function digestSentRecently(admin: SupabaseClient, userId: string, now = new Date()): Promise<boolean> {
  const { count, error } = await admin
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", "digest")
    .gte("created_at", new Date(now.getTime() - DIGEST_MIN_GAP_DAYS * DAY).toISOString());
  return error ? true : (count ?? 0) > 0; // when in doubt, don't send another
}
