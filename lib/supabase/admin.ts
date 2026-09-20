import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * A client that bypasses row level security. Server code only; the key is never sent to a browser.
 * Used for things the app must do on someone's behalf, like emailing another user.
 * Returns null when SUPABASE_SERVICE_ROLE_KEY isn't set, so features that need it quietly turn off.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
