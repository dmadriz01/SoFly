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
