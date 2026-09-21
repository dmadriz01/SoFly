"use server";

import { waitUntil } from "@vercel/functions";
import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/admin";
import { cancelEventAsModerator, reinstateEvent, setReportReviewed, type ActionResult } from "@/lib/admin-actions";
import { notifyEventCancelled } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";

// Server actions are public endpoints: anyone can call them with any input. So each one checks
// that the caller is a real, verified admin before it touches anything.
async function admin() {
  if (!(await getAdminUser())) return { error: "Not allowed." } as const;
  const client = createAdminClient();
  if (!client) return { error: "The server key isn't set, so the admin page can't make changes." } as const;
  return { client } as const;
}

function refresh(eventId?: string) {
  revalidatePath("/admin");
  if (eventId) revalidatePath(`/events/${eventId}`);
  revalidatePath("/");
  revalidatePath("/me");
}

/** Cancels a meetup (people who were going are emailed and pushed) and closes its reports. */
export async function adminCancelEvent(eventId: string): Promise<ActionResult> {
  const a = await admin();
  if ("error" in a) return { error: a.error };
  const result = await cancelEventAsModerator(a.client, eventId, (id) => waitUntil(notifyEventCancelled(id, {}, "moderator")));
  if (!result.error) refresh(eventId);
  return result;
}

export async function adminReinstateEvent(eventId: string): Promise<ActionResult> {
  const a = await admin();
  if ("error" in a) return { error: a.error };
  const result = await reinstateEvent(a.client, eventId);
  if (!result.error) refresh(eventId);
  return result;
}

export async function adminSetReportReviewed(reportId: string, reviewed: boolean): Promise<ActionResult> {
  const a = await admin();
  if ("error" in a) return { error: a.error };
  const result = await setReportReviewed(a.client, reportId, Boolean(reviewed));
  if (!result.error) refresh();
  return result;
}
