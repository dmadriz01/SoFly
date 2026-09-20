import type { SupabaseClient } from "@supabase/supabase-js";
import type { About } from "./about";

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

const ABOUT_COLUMNS = "user_id, bio, linkedin, instagram, x_handle, tiktok, facebook";

/**
 * The person's own "about you". null means they've never been asked; a row with an empty bio means
 * they skipped. A read error counts as "answered" so a hiccup can never trap anyone in onboarding.
 */
export async function getAbout(supabase: SupabaseClient, userId: string): Promise<About | null> {
  const { data, error } = await supabase.from("profile_bios").select(ABOUT_COLUMNS).eq("user_id", userId).maybeSingle();
  if (error) return { bio: "", linkedin: null, instagram: null, x_handle: null, tiktok: null, facebook: null };
  return (data as (About & { user_id: string }) | null) ?? null;
}

/** Bios for several people, keyed by user id. Row level security returns only the ones the viewer may see. */
export async function getAboutFor(supabase: SupabaseClient, userIds: string[]): Promise<Record<string, About>> {
  if (userIds.length === 0) return {};
  const { data } = await supabase.from("profile_bios").select(ABOUT_COLUMNS).in("user_id", userIds);
  return Object.fromEntries(((data ?? []) as (About & { user_id: string })[]).map((r) => [r.user_id, r]));
}
