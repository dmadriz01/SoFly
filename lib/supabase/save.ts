import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

/**
 * Save a row that belongs to the current user: update it if it exists, otherwise insert it.
 *
 * Not `.upsert()`. Supabase runs that as `ON CONFLICT ... DO UPDATE SET <every column>`, which also
 * rewrites the key columns. The database only lets the app write the columns it needs (see
 * supabase/schema.sql, section 6), and letting it rewrite keys would be unsafe, so it refuses.
 *
 * `match` identifies the row (its key columns); `values` are the columns that can change.
 */
export async function updateOrInsert(
  supabase: SupabaseClient,
  table: string,
  match: Record<string, string>,
  values: Record<string, unknown>
): Promise<{ error: PostgrestError | null }> {
  const keyColumn = Object.keys(match)[0];
  const tryUpdate = () => supabase.from(table).update(values).match(match).select(keyColumn);

  const first = await tryUpdate();
  if (first.error) return { error: first.error };
  if (first.data && first.data.length > 0) return { error: null };

  const inserted = await supabase.from(table).insert({ ...match, ...values });
  // Someone else (another tab, a double tap) inserted it first: it exists now, so update it.
  if (inserted.error?.code === "23505") return { error: (await tryUpdate()).error };
  return { error: inserted.error };
}
