import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The user's birth date (YYYY-MM-DD), or null if they haven't completed onboarding.
 * Stored in profile_private, which only the owner can read.
 */
export async function getBirthDate(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("profile_private")
    .select("birth_date")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.birth_date as string | undefined) ?? null;
}
