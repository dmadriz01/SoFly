import { pacificHour } from "./time";

// Who gets which notification, and when. Pure, so it can be tested without a database.
//
//   critical  : answers to your requests, cancellations, changes to a meetup you joined, spots
//               that open up on a waitlist you joined. Email follows the email switch; push always goes.
//   reminders : the day-before reminder, "still coming?", the after-meetup recap.
//   matches   : the weekly "meetups you might like" digest.
//   activity  : things happening on your meetups (requests, a friend joined, a wrap-up as host).
//
// A person can switch reminders / matches / activity off, and set quiet hours (Pacific time) during
// which push notifications of those three kinds wait. Email is unaffected by quiet hours.

export type Category = "reminders" | "matches" | "activity" | "critical";

export type Prefs = {
  /** The master email switch (Me > Notifications). Login codes always come through. */
  email: boolean;
  reminders: boolean;
  matches: boolean;
  activity: boolean;
  /** Quiet hours, 0-23 in Pacific time. Both null = none. The window may cross midnight (22 to 8). */
  quietStart: number | null;
  quietEnd: number | null;
};

export const DEFAULT_PREFS: Prefs = { email: true, reminders: true, matches: true, activity: true, quietStart: null, quietEnd: null };

const hour = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 23 ? v : null);

/** Settings from a database row. Anything missing or odd means the default: notifications on, no quiet hours. */
export function parsePrefs(row: Record<string, unknown> | null | undefined): Prefs {
  if (!row) return { ...DEFAULT_PREFS };
  const on = (v: unknown) => v !== false; // only an explicit false switches something off
  const start = hour(row.quiet_start);
  const end = hour(row.quiet_end);
  const both = start !== null && end !== null;
  return {
    email: on(row.email_notifications),
    reminders: on(row.notify_reminders),
    matches: on(row.notify_matches),
    activity: on(row.notify_activity),
    quietStart: both ? start : null,
    quietEnd: both ? end : null,
  };
}

/** Whether `at` falls inside the person's quiet hours (in Pacific time). */
export function inQuietHours(prefs: Prefs, at: Date): boolean {
  const { quietStart: s, quietEnd: e } = prefs;
  if (s === null || e === null || s === e) return false;
  const h = pacificHour(at.toISOString());
  return s < e ? h >= s && h < e : h >= s || h < e;
}

/** Which channels a notification of this kind may use for this person right now. */
export function channelsFor(prefs: Prefs, category: Category, at: Date): { email: boolean; push: boolean } {
  if (category === "critical") return { email: prefs.email, push: true };
  const wanted = category === "reminders" ? prefs.reminders : category === "matches" ? prefs.matches : prefs.activity;
  if (!wanted) return { email: false, push: false };
  return { email: prefs.email, push: !inQuietHours(prefs, at) };
}

/** Nudges: things we send that nobody asked for in the moment. They're limited per person (see notify-log.ts). */
export const NUDGE_KINDS = ["digest", "still_coming", "friend_joined", "host_recap", "recap"] as const;
export const NUDGE_PUSH_CAP_PER_DAY = 3;
/** The weekly digest is never sent more often than this. */
export const DIGEST_MIN_GAP_DAYS = 6;

/** The quiet-hours choices offered in settings. */
export const QUIET_PRESETS: { label: string; start: number | null; end: number | null }[] = [
  { label: "Off", start: null, end: null },
  { label: "9 PM to 8 AM", start: 21, end: 8 },
  { label: "10 PM to 8 AM", start: 22, end: 8 },
  { label: "11 PM to 9 AM", start: 23, end: 9 },
];
