import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_CITY_ID, cityById, isMultiCity } from "./cities";

export const CITY_COOKIE = "sofly_city";

/**
 * The city someone is browsing: the one they picked on this device, else the one saved to their
 * account, else the first city. A one-city app always answers with that city and never looks anything up.
 */
export async function currentCity(supabase: SupabaseClient, userId: string | null | undefined): Promise<string> {
  if (!isMultiCity()) return DEFAULT_CITY_ID;
  const fromCookie = cityById(cookies().get(CITY_COOKIE)?.value);
  if (fromCookie) return fromCookie.id;
  if (userId) {
    // Best effort: an account with nothing saved (or a database without the column yet) just gets the first city.
    const { data } = await supabase.from("user_settings").select("city").eq("user_id", userId).maybeSingle();
    const saved = cityById(data?.city);
    if (saved) return saved.id;
  }
  return DEFAULT_CITY_ID;
}
