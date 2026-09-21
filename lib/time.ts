// All event times are shown in, and entered as, Pacific time.
export const TZ = "America/Los_Angeles";

function fmt(opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, ...opts });
}

function wallParts(at: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  return Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<
    "year" | "month" | "day" | "hour" | "minute" | "second",
    string
  >;
}

/** Pacific calendar date as YYYY-MM-DD. */
function dayKey(d: Date) {
  const p = wallParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

export const pacificDate = (d = new Date()) => dayKey(d);

/** The hour of day (0-23) in Pacific time for a timestamp. */
export const pacificHour = (iso: string) => Number(wallParts(new Date(iso)).hour);

/** A YYYY-MM-DD date plus (or minus) whole days. Pure calendar math, so daylight saving can't skew it. */
export function addDaysToKey(key: string, days: number) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const nextDayKey = (key: string) => addDaysToKey(key, 1);

/** "Today · 6:30 PM", "Tomorrow · 6:30 PM", "Sat, Sep 20 · 6:30 PM" */
export function formatWhenShort(iso: string, now = new Date()) {
  const d = new Date(iso);
  const time = fmt({ hour: "numeric", minute: "2-digit" }).format(d);
  const key = dayKey(d);
  const today = dayKey(now);
  let day: string;
  if (key === today) day = "Today";
  else if (key === nextDayKey(today)) day = "Tomorrow";
  else day = fmt({ weekday: "short", month: "short", day: "numeric" }).format(d);
  return `${day} · ${time}`;
}

/** "Sat, Sep 26 · 10:00 AM": always the actual day, never "Today" or "Tomorrow". */
export function formatWhenAbsolute(iso: string) {
  const d = new Date(iso);
  return `${fmt({ weekday: "short", month: "short", day: "numeric" }).format(d)} · ${fmt({ hour: "numeric", minute: "2-digit" }).format(d)}`;
}

/** "Sep 22" */
export const formatDayShort = (iso: string) => fmt({ month: "short", day: "numeric" }).format(new Date(iso));

/** { day: "Saturday, September 20", time: "6:30 PM PDT" } */
export function formatWhenLong(iso: string) {
  const d = new Date(iso);
  return {
    day: fmt({ weekday: "long", month: "long", day: "numeric" }).format(d),
    time: fmt({ hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(d),
  };
}

function offsetMs(at: Date) {
  const p = wallParts(at);
  const asUtc = Date.UTC(
    +p.year,
    +p.month - 1,
    +p.day,
    +p.hour,
    +p.minute,
    +p.second
  );
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * Interpret a `datetime-local` value ("2026-09-20T18:30") as Pacific wall-clock
 * time and return the matching instant. Returns null for malformed input or a
 * wall time that doesn't exist (e.g. inside the spring-forward gap).
 */
export function pacificLocalToUtc(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let guess = asUtc - offsetMs(new Date(asUtc));
  guess = asUtc - offsetMs(new Date(guess));
  const result = new Date(guess);
  if (Number.isNaN(result.getTime())) return null;

  const back = wallParts(result);
  const roundTrip = `${back.year}-${back.month}-${back.day}T${back.hour}:${back.minute}`;
  return roundTrip === value ? result : null;
}
