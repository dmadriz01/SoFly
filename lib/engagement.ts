import { ageOn, withinAgeRange } from "./age";
import { collapseSeries } from "./recurrence";
import { pacificDate } from "./time";

// Choosing which meetups to suggest: for the weekly digest, and "similar meetups" after a meetup.
// Pure and deterministic (the same input always gives the same list), so it's easy to test.

export type Candidate = {
  id: string;
  title: string;
  category: string;
  neighborhood: string;
  starts_at: string;
  spots_left: number;
  audience: string;
  age_min: number | null;
  age_max: number | null;
  host_id: string;
  series_id?: string | null;
};

/** What we know someone likes: the categories they picked, plus places and things they've been to. */
export type Taste = { categories: string[]; neighborhoods: string[] };

const DAY = 24 * 60 * 60 * 1000;

export function scoreMeetup(c: Candidate, taste: Taste, now: Date, withinDays: number): number {
  const days = (new Date(c.starts_at).getTime() - now.getTime()) / DAY;
  const soon = Math.max(0, 1 - days / withinDays); // 1 = right now, 0 = at the far end of the window
  return (
    (taste.categories.includes(c.category) ? 3 : 0) +
    (taste.neighborhoods.includes(c.neighborhood) ? 1 : 0) +
    soon +
    (c.spots_left <= 3 ? 0.5 : 0) // honestly filling up
  );
}

/**
 * The best few meetups for one person: upcoming within the window, with a spot free, open to
 * everyone (we don't know anyone's gender, so women-only and men-only are left out), inside their
 * age range if we know it, not already joined or hosted, and only the next date of any series.
 */
export function rankMeetups(
  candidates: Candidate[],
  taste: Taste,
  opts: { now: Date; withinDays: number; exclude?: Set<string>; birthDate?: string | null; limit: number }
): Candidate[] {
  const { now, withinDays, limit } = opts;
  const end = now.getTime() + withinDays * DAY;
  const fits = candidates.filter((c) => {
    const at = new Date(c.starts_at).getTime();
    if (Number.isNaN(at) || at <= now.getTime() || at > end) return false;
    if (c.spots_left <= 0 || c.audience !== "Everyone") return false;
    if (opts.exclude?.has(c.id)) return false;
    if (opts.birthDate && !withinAgeRange(ageOn(opts.birthDate, pacificDate(new Date(c.starts_at))), c.age_min, c.age_max)) return false;
    return true;
  });
  const ordered = fits
    .map((c) => ({ c, score: scoreMeetup(c, taste, now, withinDays) }))
    .sort((a, b) => b.score - a.score || new Date(a.c.starts_at).getTime() - new Date(b.c.starts_at).getTime() || a.c.id.localeCompare(b.c.id))
    .map((x) => x.c);
  return collapseSeries(ordered).slice(0, Math.max(0, limit));
}

/** A short, honest reason a meetup was suggested. */
export function whyThis(c: Candidate, taste: Taste): string {
  if (taste.categories.includes(c.category)) return `You like ${c.category}`;
  if (taste.neighborhoods.includes(c.neighborhood)) return `Near you in ${c.neighborhood}`;
  if (c.spots_left <= 3) return `${c.spots_left} ${c.spots_left === 1 ? "spot" : "spots"} left`;
  return "Happening soon";
}
