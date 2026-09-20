// Calendar math for browsing meetups by week. Everything is a Pacific-time calendar date written
// as YYYY-MM-DD ("date key"), so daylight saving can never shift a day.
import { addDaysToKey } from "./time";

/** How far ahead the calendar lets you browse. */
export const WEEKS_AHEAD = 26;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const parts = (key: string) => key.split("-").map(Number) as [number, number, number];

/** A real calendar date in YYYY-MM-DD form (not "2026-02-30", not free text). */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = parts(value);
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
}

/** 0 = Sunday ... 6 = Saturday */
const weekday = (key: string) => {
  const [y, m, d] = parts(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/** The Monday of the week that contains this date. */
export const weekStartKey = (key: string) => addDaysToKey(key, -((weekday(key) + 6) % 7));

export type WeekDay = { key: string; name: string; day: number };

/** The seven days of a week, Monday first. */
export function weekDays(start: string): WeekDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const key = addDaysToKey(start, i);
    return { key, name: DAY_NAMES[weekday(key)], day: parts(key)[2] };
  });
}

/** "Sep 21 – 27" or "Sep 28 – Oct 4" */
export function weekRangeLabel(start: string): string {
  const end = addDaysToKey(start, 6);
  const [, sm, sd] = parts(start);
  const [, em, ed] = parts(end);
  return sm === em ? `${MONTH_NAMES[sm - 1]} ${sd} – ${ed}` : `${MONTH_NAMES[sm - 1]} ${sd} – ${MONTH_NAMES[em - 1]} ${ed}`;
}

/** "Mon, Sep 21" */
export function dayLabel(key: string): string {
  const [, m, d] = parts(key);
  return `${DAY_NAMES[weekday(key)]}, ${MONTH_NAMES[m - 1]} ${d}`;
}

/**
 * Turn what's in the address bar into a week and/or day we're willing to show. Anything invalid, in
 * the past, or too far ahead is ignored, so a hand-edited link can never break the page.
 */
export function resolveDateFilter(
  raw: { week?: string; day?: string },
  today: string
): { week?: string; day?: string } {
  const thisWeek = weekStartKey(today);
  const lastWeek = addDaysToKey(thisWeek, 7 * WEEKS_AHEAD);
  const usable = (start: string) => start >= thisWeek && start <= lastWeek;

  if (isDateKey(raw.day) && raw.day >= today && usable(weekStartKey(raw.day))) {
    return { week: weekStartKey(raw.day), day: raw.day };
  }
  if (isDateKey(raw.week) && usable(weekStartKey(raw.week))) return { week: weekStartKey(raw.week) };
  return {};
}

/** The UTC instants [from, to) covering a day, or a whole week, in Pacific time. */
export function dateRangeKeys(filter: { week?: string; day?: string }): { from: string; to: string } | null {
  if (filter.day) return { from: filter.day, to: addDaysToKey(filter.day, 1) };
  if (filter.week) return { from: filter.week, to: addDaysToKey(filter.week, 7) };
  return null;
}
