import type { SupabaseClient } from "@supabase/supabase-js";

// What a moderator can do. Each takes the database client so it can be tested; app/admin/actions.ts
// is the only caller and checks the person really is an admin first.

export type ActionResult = { error?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cancels a meetup, marks its reports as dealt with, and tells the people who were going. */
export async function cancelEventAsModerator(
  admin: SupabaseClient,
  eventId: string,
  notify: (eventId: string) => void,
  now = new Date()
): Promise<ActionResult> {
  if (!UUID.test(eventId)) return { error: "That isn't a valid meetup." };
  const { data, error } = await admin
    .from("events")
    .update({ cancelled_at: now.toISOString() })
    .eq("id", eventId)
    .is("cancelled_at", null)
    .select("id");
  if (error) return { error: "Couldn't cancel this meetup. Please try again." };
  if (!data || data.length === 0) return { error: "That meetup doesn't exist or is already cancelled." };

  // The reports are handled by cancelling. If this part fails the cancellation still stands.
  const { error: reviewError } = await admin
    .from("reports")
    .update({ reviewed_at: now.toISOString() })
    .eq("event_id", eventId)
    .is("reviewed_at", null);
  if (reviewError) console.error("Cancelled, but couldn't mark the reports reviewed:", reviewError.message);

  notify(eventId);
  return {};
}

/** Undoes a cancellation. (Guests were told it was cancelled and are not told again.) */
export async function reinstateEvent(admin: SupabaseClient, eventId: string): Promise<ActionResult> {
  if (!UUID.test(eventId)) return { error: "That isn't a valid meetup." };
  const { data, error } = await admin
    .from("events")
    .update({ cancelled_at: null })
    .eq("id", eventId)
    .not("cancelled_at", "is", null)
    .select("id");
  if (error) return { error: "Couldn't reinstate this meetup. Please try again." };
  if (!data || data.length === 0) return { error: "That meetup isn't cancelled." };
  return {};
}

export async function setReportReviewed(admin: SupabaseClient, reportId: string, reviewed: boolean, now = new Date()): Promise<ActionResult> {
  if (!UUID.test(reportId)) return { error: "That isn't a valid report." };
  const { data, error } = await admin
    .from("reports")
    .update({ reviewed_at: reviewed ? now.toISOString() : null })
    .eq("id", reportId)
    .select("id");
  if (error) return { error: "Couldn't update this report. Please try again." };
  if (!data || data.length === 0) return { error: "That report no longer exists." };
  return {};
}
