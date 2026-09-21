import { addDaysToKey, pacificLocalToUtc, pacificLocalValue } from "./time";

// Recurring meetups: "every week for 8 weeks" posts eight ordinary meetups, one per date, tied
// together by a shared series id. Each has its own guest list, edits and cancellation.

export const REPEAT_CHOICES = [7, 14] as const;
export type RepeatEvery = (typeof REPEAT_CHOICES)[number];
export const MIN_OCCURRENCES = 2;
export const MAX_OCCURRENCES = 12;

export const isRepeatEvery = (v: unknown): v is RepeatEvery => v === 7 || v === 14;
export const repeatLabel = (days: number | null | undefined) => (days === 7 ? "Weekly" : days === 14 ? "Every 2 weeks" : null);

/** Why the repeat settings aren't acceptable, or undefined if they are (or there's no repeat). */
export function repeatProblems(every: string, count: string): { repeat_every?: string; repeat_count?: string } {
  if (!every) return {};
  const out: { repeat_every?: string; repeat_count?: string } = {};
  if (!isRepeatEvery(Number(every))) out.repeat_every = "Pick how often it repeats.";
  const n = Number(count);
  if (!count) out.repeat_count = "How many meetups in total?";
  else if (!Number.isInteger(n) || n < MIN_OCCURRENCES || n > MAX_OCCURRENCES) {
    out.repeat_count = `Choose a number from ${MIN_OCCURRENCES} to ${MAX_OCCURRENCES}.`;
  }
  return out;
}

/**
 * The start time of each date in a series, as UTC timestamps. Every date keeps the same wall-clock
 * time in Pacific time, so a 6:30 PM run stays at 6:30 PM across the clock changes in March and
 * November. `firstLocal` is the form's value ("2026-09-20T18:30"). Null if the time can't be read.
 */
export function occurrenceStarts(firstLocal: string, everyDays: number, count: number): string[] | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(firstLocal);
  if (!m || !isRepeatEvery(everyDays) || !Number.isInteger(count) || count < 1 || count > 26) return null;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const day = addDaysToKey(m[1], i * everyDays);
    let start = pacificLocalToUtc(`${day}T${m[2]}:${m[3]}`);
    // The hour doesn't exist on the day clocks spring forward (e.g. 2:30 AM): use the hour after it.
    if (!start) start = pacificLocalToUtc(`${day}T${String((Number(m[2]) + 1) % 24).padStart(2, "0")}:${m[3]}`);
    if (!start) return null;
    out.push(start.toISOString());
  }
  return out;
}

/**
 * For the feed: show only the next date of each series (a weekly run for twelve weeks would
 * otherwise fill the page). The input must already be in the order it will be shown; meetups that
 * aren't part of a series pass through untouched.
 */
export function collapseSeries<T extends { series_id?: string | null }>(events: T[], perSeries = 1): T[] {
  const seen = new Map<string, number>();
  return events.filter((e) => {
    if (!e.series_id) return true;
    const n = seen.get(e.series_id) ?? 0;
    seen.set(e.series_id, n + 1);
    return n < perSeries;
  });
}

/** Series whose dates have all passed or been cancelled: the host may want to add more. */
export function seriesNeedingMoreDates<T extends { id: string; series_id?: string | null; starts_at: string; cancelled_at: string | null; repeat_every?: number | null }>(
  hosted: T[],
  now = new Date(),
  withinDays = 45
): T[] {
  const bySeries = new Map<string, T[]>();
  for (const e of hosted) if (e.series_id) bySeries.set(e.series_id, [...(bySeries.get(e.series_id) ?? []), e]);
  const out: T[] = [];
  for (const dates of Array.from(bySeries.values())) {
    const live = dates.filter((d) => !d.cancelled_at);
    if (live.length === 0) continue; // the host called the whole thing off
    if (live.some((d) => new Date(d.starts_at) > now)) continue; // still has dates ahead
    const last = live.reduce((a, b) => (new Date(a.starts_at) > new Date(b.starts_at) ? a : b));
    const ageDays = (now.getTime() - new Date(last.starts_at).getTime()) / 86400000;
    if (ageDays <= withinDays) out.push(last);
  }
  return out.sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());
}

/**
 * A good time for the next meetup when posting again from an old one: the same weekday and
 * wall-clock time, a week (or two) after the old one, moved forward until it's comfortably in the
 * future. Returns the form's value ("2026-09-27T18:30"), or null if the old time can't be read.
 */
export function suggestNextStart(previousStartIso: string, everyDays: number = 7, now = new Date()): string | null {
  const prev = new Date(previousStartIso);
  if (Number.isNaN(prev.getTime()) || !isRepeatEvery(everyDays)) return null;
  const local = pacificLocalValue(previousStartIso);
  const time = local.slice(11);
  let day = local.slice(0, 10);
  for (let i = 0; i < 400; i++) {
    day = addDaysToKey(day, everyDays);
    const at = pacificLocalToUtc(`${day}T${time}`);
    if (at && at.getTime() > now.getTime() + 60 * 60 * 1000) return `${day}T${time}`;
  }
  return null;
}
