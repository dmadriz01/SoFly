import { createClient } from "@/lib/supabase/server";

/**
 * How many join requests are waiting on the current user, across events they host.
 * Pending rows are only visible to the host and to the requester, so "pending rows that
 * aren't mine" is exactly "requests for me to review".
 */
export async function getPendingRequestCount(): Promise<number> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return 0;
    const { count } = await supabase
      .from("rsvps")
      .select("event_id", { count: "exact", head: true })
      .eq("status", "pending")
      .neq("user_id", user.id);
    return count ?? 0;
  } catch {
    return 0;
  }
}
