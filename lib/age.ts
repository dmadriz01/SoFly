export const MIN_AGE = 18;

/** Whole years of age on a given date. Both arguments are YYYY-MM-DD. */
export function ageOn(birthDate: string, onDate: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [oy, om, od] = onDate.split("-").map(Number);
  let age = oy - by;
  if (om < bm || (om === bm && od < bd)) age -= 1;
  return age;
}

/** Validates a real calendar date from three form fields. Returns YYYY-MM-DD or null. */
export function parseBirthDate(year: string, month: string, day: string): string | null {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d)
    return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export const withinAgeRange = (age: number, min: number | null, max: number | null) =>
  (min == null || age >= min) && (max == null || age <= max);

/** "21+", "21–25", or null when the event is open to anyone 18+. */
export function ageLabel(min: number | null, max: number | null) {
  if (min == null && max == null) return null;
  if (max == null) return `${min}+`;
  return `${min}–${max}`;
}

export const MAX_AGE = 120;

/** Whether a typed age is a whole number in 18-120. Blank is fine (it means "no limit"). */
export function ageFieldProblem(value: string): string | undefined {
  if (value.trim() === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < MIN_AGE || n > MAX_AGE) return `Enter a whole number from ${MIN_AGE} to ${MAX_AGE}, or leave it blank.`;
  return undefined;
}

/**
 * Turn the two age boxes into the range stored on the event. Blank means "no limit". Because
 * SoFly is 18+ only, "from 18" with no upper limit is the same as no restriction, and a limit
 * with no start begins at 18. Assumes the values already passed ageFieldProblem.
 */
export function resolveAgeRange(minText: string, maxText: string): { min: number | null; max: number | null } {
  const min = minText.trim() === "" ? null : Number(minText);
  const max = maxText.trim() === "" ? null : Number(maxText);
  if (min === null && max === null) return { min: null, max: null };
  if (max === null) return min === MIN_AGE ? { min: null, max: null } : { min, max: null };
  return { min: min ?? MIN_AGE, max };
}
