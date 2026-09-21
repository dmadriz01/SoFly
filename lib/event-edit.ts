import { formatWhenAbsolute } from "./time";

// What a host changed when they edited a meetup's date/time or place. Pure, so the action, the
// notifications and the tests all agree on what counts as a change.

export type PlaceState = { starts_at: string; neighborhood: string; venue_name: string; address: string };
export type DetailChange = { what: "Time" | "Neighborhood" | "Venue" | "Address"; from: string; to: string };

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Everything that differs between the old and new date/time and place. Empty means nothing changed. */
export function describeEdit(before: PlaceState, after: PlaceState): DetailChange[] {
  const out: DetailChange[] = [];
  if (new Date(before.starts_at).getTime() !== new Date(after.starts_at).getTime()) {
    out.push({ what: "Time", from: formatWhenAbsolute(before.starts_at), to: formatWhenAbsolute(after.starts_at) });
  }
  if (clean(before.neighborhood) !== clean(after.neighborhood)) out.push({ what: "Neighborhood", from: before.neighborhood, to: after.neighborhood });
  if (clean(before.venue_name) !== clean(after.venue_name)) out.push({ what: "Venue", from: before.venue_name, to: after.venue_name });
  if (clean(before.address) !== clean(after.address)) out.push({ what: "Address", from: before.address, to: after.address });
  return out;
}

/** A short line for a push notification. It says what kind of thing changed, never the address itself. */
export function pushSummary(changes: DetailChange[]): string {
  const time = changes.some((c) => c.what === "Time");
  const place = changes.some((c) => c.what !== "Time");
  if (time && place) return "The host changed the time and the place. Tap to see the new details.";
  if (time) return "The host changed the time. Tap to see the new details.";
  return "The host changed the place. Tap to see the new details.";
}
