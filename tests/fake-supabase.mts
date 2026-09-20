// A tiny in-memory stand-in for the parts of the Supabase client the email code uses, so the
// real logic can run against realistic data without a network or a service key.
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
export type FakeData = Record<string, Row[]>;

export function fakeAdmin(
  data: FakeData,
  users: Record<string, { email: string | null }>,
  opts: { lookupError?: string } = {}
) {
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let deleting = false;
    const matching = () => (data[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const api = {
      select: () => api,
      delete: () => ((deleting = true), api),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), api),
      is: (c: string, v: unknown) => (filters.push((r) => (v === null ? r[c] == null : r[c] === v)), api),
      gte: (c: string, v: string) => (filters.push((r) => new Date(r[c] as string) >= new Date(v)), api),
      lt: (c: string, v: string) => (filters.push((r) => new Date(r[c] as string) < new Date(v)), api),
      maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => {
        if (deleting) {
          const doomed = matching();
          data[table] = (data[table] ?? []).filter((r) => !doomed.includes(r));
          return resolve({ data: [], error: null });
        }
        return resolve({ data: matching(), error: null });
      },
    };
    return api;
  };
  const getUserById = async (id: string) =>
    opts.lookupError
      ? { data: { user: null }, error: { message: opts.lookupError } }
      : users[id]
        ? { data: { user: { id, email: users[id].email } }, error: null }
        : { data: { user: null }, error: { message: "User not found" } };
  return { from, auth: { admin: { getUserById } } } as unknown as SupabaseClient;
}

/** A fake inbox: collects what would have been sent. */
export function fakeMailbox(behaviour: (to: string) => "ok" | "fail" = () => "ok") {
  const sent: { to: string; subject: string; text: string; html?: string }[] = [];
  const send = async (mail: { to: string; subject: string; text: string; html?: string }) => {
    if (behaviour(mail.to) === "fail") return { ok: false as const, reason: "smtp-error" as const, detail: "EAUTH · 535 · Username and Password not accepted" };
    sent.push(mail);
    return { ok: true as const };
  };
  return { sent, send };
}
