import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The categories a user picked. null means they've never been asked; [] means they skipped.
 * A read error counts as "skipped" so a hiccup can never trap someone in onboarding.
 */
export async function getInterests(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("user_interests")
    .select("categories")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return [] as string[];
  if (!data) return null;
  return (data.categories as string[]) ?? [];
}
