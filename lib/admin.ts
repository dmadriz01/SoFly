import "server-only";
import { createClient } from "./supabase/server";
import { isAdminUser } from "./admin-access";

/**
 * The signed-in admin, or null. The login is checked with Supabase on the server (not read from a
 * cookie the browser could edit), and the address must be verified and listed in ADMIN_EMAILS.
 * Every admin page and action calls this first.
 */
export async function getAdminUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isAdminUser(user) ? user : null;
}
