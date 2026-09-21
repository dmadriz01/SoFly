import { coverSvg } from "./cover";
import { formatDayShort, formatWhenAbsolute } from "./time";

// The cover picture is drawn from a meetup's details, so when one changes the picture can change
// too. The database remembers when that happened and what the details were before (events.
// details_changed_at / details_before); this decides who should be told on the meetup page, and what
// the note says.

export type ChangeItem = { what: string; from: string; to: string };
export type CoverChangeNote = { date: string; changes: ChangeItem[]; redrawn: boolean };

type Details = { starts_at: string; neighborhood: string; category: string; skill_level: string; max_spots: number };

export type CoverChangeInput = Details & {
  id: string;
  details_changed_at?: string | null;
  details_before?: unknown;
};

/** The old details from the database, or null if they aren't usable. Never throws. */
export function readBefore(raw: unknown): Details | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (
    typeof b.starts_at !== "string" || Number.isNaN(new Date(b.starts_at).getTime()) ||
    typeof b.neighborhood !== "string" ||
    typeof b.category !== "string" ||
    typeof b.skill_level !== "string" ||
    typeof b.max_spots !== "number"
  ) return null;
  return { starts_at: b.starts_at, neighborhood: b.neighborhood, category: b.category, skill_level: b.skill_level, max_spots: b.max_spots };
}

/** What differs between the old details and the current ones, worded for people. */
export function describeChanges(before: Details, now: Details): ChangeItem[] {
  const out: ChangeItem[] = [];
  if (new Date(before.starts_at).getTime() !== new Date(now.starts_at).getTime()) {
    out.push({ what: "Time", from: formatWhenAbsolute(before.starts_at), to: formatWhenAbsolute(now.starts_at) });
  }
  if (before.neighborhood !== now.neighborhood) out.push({ what: "Neighborhood", from: before.neighborhood, to: now.neighborhood });
  if (before.category !== now.category) out.push({ what: "Category", from: before.category, to: now.category });
  if (before.skill_level !== now.skill_level) out.push({ what: "Skill level", from: before.skill_level, to: now.skill_level });
  if (before.max_spots !== now.max_spots) out.push({ what: "Spots", from: String(before.max_spots), to: String(now.max_spots) });
  return out;
}

const pictureOf = (id: string, d: Details) =>
  coverSvg({ id, category: d.category, neighborhood: d.neighborhood, startsAt: d.starts_at, skill: d.skill_level, maxSpots: d.max_spots });

/**
 * The note to show under a meetup's picture, or null for no note.
 *
 * Shown to the host and to anyone who had already joined or asked to join before the change, while
 * the meetup is still ahead of us and not cancelled, and only when something that matters changed:
 * the picture itself looks different, or the time, place, category or skill level changed. (Spots
 * going from 12 to 10 changes nothing anyone sees, so it stays quiet.)
 */
export function coverChangeNote(
  event: CoverChangeInput,
  viewer: { isHost: boolean; joinedAt: string | null },
  state: { cancelled: boolean; ended: boolean }
): CoverChangeNote | null {
  if (state.cancelled || state.ended) return null;
  if (!event.details_changed_at || Number.isNaN(new Date(event.details_changed_at).getTime())) return null;
  const before = readBefore(event.details_before);
  if (!before) return null;

  const changedAt = new Date(event.details_changed_at).getTime();
  const joinedBefore = viewer.joinedAt !== null && new Date(viewer.joinedAt).getTime() < changedAt;
  if (!viewer.isHost && !joinedBefore) return null;

  const changes = describeChanges(before, event);
  if (changes.length === 0) return null;
  const redrawn = pictureOf(event.id, before) !== pictureOf(event.id, event);
  const matters = redrawn || changes.some((c) => c.what !== "Spots");
  if (!matters) return null;

  return { date: formatDayShort(event.details_changed_at), changes, redrawn };
}
