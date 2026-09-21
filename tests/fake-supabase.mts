// A tiny in-memory stand-in for the parts of the Supabase client the email code uses, so the
// real logic can run against realistic data without a network or a service key.
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
export type FakeData = Record<string, Row[]>;

export function fakeAdmin(
  data: FakeData,
  users: Record<string, { email: string | null }>,
  opts: { lookupError?: string; /** act like a database without the new settings columns (migration 019) */ noPrefColumns?: boolean; /** act like a database without the send log table */ logError?: boolean } = {}
) {
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    const sorts: { col: string; asc: boolean }[] = [];
    let deleting = false;
    let updating: Row | null = null;
    let inserting: Row | null = null;
    let headCount = false;
    let selected = "";
    let window: [number, number] | null = null;
    const matching = () => (data[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const ordered = () => {
      const rows = [...matching()];
      // apply the LAST order() first so the first one wins, like a multi-column ORDER BY
      for (const { col, asc } of [...sorts].reverse()) {
        rows.sort((a, b) => (a[col]! < b[col]! ? -1 : a[col]! > b[col]! ? 1 : 0) * (asc ? 1 : -1));
      }
      return window ? rows.slice(window[0], window[1] + 1) : rows;
    };
    const cmp = (r: Row, c: string, v: unknown) => [new Date(r[c] as string).getTime(), new Date(v as string).getTime()] as const;
    const api = {
      select: (cols?: string, o?: { count?: string; head?: boolean }) => ((selected = cols ?? ""), (headCount = Boolean(o?.head)), api),
      delete: () => ((deleting = true), api),
      update: (values: Row) => ((updating = values), api),
      insert: (row: Row) => ((inserting = row), api),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), api),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), api),
      is: (c: string, v: unknown) => (filters.push((r) => (v === null ? r[c] == null : r[c] === v)), api),
      not: (c: string, op: string, v: unknown) => (filters.push((r) => (op === "is" && v === null ? r[c] != null : true)), api),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), api),
      gte: (c: string, v: string) => (filters.push((r) => new Date(r[c] as string) >= new Date(v)), api),
      gt: (c: string, v: string) => (filters.push((r) => cmp(r, c, v)[0] > cmp(r, c, v)[1]), api),
      lt: (c: string, v: string) => (filters.push((r) => new Date(r[c] as string) < new Date(v)), api),
      lte: (c: string, v: string) => (filters.push((r) => cmp(r, c, v)[0] <= cmp(r, c, v)[1]), api),
      ilike: (c: string, pattern: string) => {
        // % is "anything"; a backslash escapes % and _ (what the app's search box does)
        let re = "";
        for (let i = 0; i < pattern.length; i++) {
          const ch = pattern[i];
          if (ch === "\\" && i + 1 < pattern.length) re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          else if (ch === "%") re += ".*";
          else if (ch === "_") re += ".";
          else re += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        }
        const rx = new RegExp(`^${re}$`, "i");
        filters.push((r) => rx.test(String(r[c] ?? "")));
        return api;
      },
      order: (col: string, o?: { ascending?: boolean }) => (sorts.push({ col, asc: o?.ascending !== false }), api),
      range: (a: number, b: number) => ((window = [a, b]), api),
      limit: (n: number) => ((window = [0, n - 1]), api),
      maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[] | null; error: { code?: string; message: string } | null; count?: number }) => unknown) => {
        if (inserting) {
          if (table === "notification_log" && opts.logError) return resolve({ data: null, error: { code: "42P01", message: 'relation "notification_log" does not exist' } });
          const rows = (data[table] ??= []);
          // the send log is unique per (person, kind, ref), like the real table
          if (table === "notification_log" && rows.some((r) => r.user_id === inserting!.user_id && r.kind === inserting!.kind && (r.ref ?? "") === (inserting!.ref ?? ""))) {
            return resolve({ data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } as never });
          }
          rows.push({ created_at: new Date().toISOString(), ...inserting });
          return resolve({ data: null, error: null });
        }
        if (deleting) {
          const doomed = matching();
          data[table] = (data[table] ?? []).filter((r) => !doomed.includes(r));
          return resolve({ data: [], error: null });
        }
        if (updating) {
          const rows = matching();
          rows.forEach((r) => Object.assign(r, updating));
          return resolve({ data: rows.map((r) => ({ ...r })), error: null });
        }
        if (table === "user_settings" && opts.noPrefColumns && /notify_|quiet_/.test(selected)) return resolve({ data: null, error: { message: "column user_settings.notify_reminders does not exist" } });
        if (table === "notification_log" && opts.logError) return resolve({ data: null, error: { code: "42P01", message: 'relation "notification_log" does not exist' } });
        if (headCount) return resolve({ data: null, error: null, count: matching().length });
        return resolve({ data: ordered(), error: null });
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
