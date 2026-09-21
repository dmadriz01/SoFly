import { ageFieldProblem } from "./age";
import {
  isAudience,
  isCategory,
  isJoinMode,
  isNeighborhood,
  isSkillLevel,
} from "./constants";
import { parseChatUrl } from "./chat";
import { pacificLocalToUtc } from "./time";

export const EVENT_FIELDS = [
  "title",
  "category",
  "neighborhood",
  "venue_name",
  "address",
  "starts_at",
  "max_spots",
  "description",
  "chat_url",
  "skill_level",
  "audience",
  "age_min",
  "age_max",
  "join_mode",
] as const;

export type EventField = (typeof EVENT_FIELDS)[number];
export type EventErrors = Partial<Record<EventField, string>>;

export const LIMITS = {
  title: 100,
  venue_name: 100,
  address: 200,
  description: 1000,
  maxSpots: 200,
};

// One rule per field, shared by posting and editing so the two can never drift apart.
const neighborhoodError = (v: string) => (isNeighborhood(v) ? undefined : "Pick a neighborhood.");

const venueError = (v: string) =>
  !v
    ? "Where are you meeting?"
    : v.length > LIMITS.venue_name
      ? `Keep it under ${LIMITS.venue_name} characters.`
      : undefined;

const addressError = (v: string) =>
  !v
    ? "Add the full address so people can find you."
    : v.length > LIMITS.address
      ? `Keep it under ${LIMITS.address} characters.`
      : undefined;

const startsAtError = (v: string) => {
  if (!v) return "Pick a date and time.";
  const when = pacificLocalToUtc(v);
  if (!when) return "That isn't a valid date and time.";
  if (when.getTime() <= Date.now()) return "Pick a time in the future.";
  return undefined;
};

const maxSpotsError = (raw: string) => {
  if (!raw) return "How many people can join?";
  const spots = Number(raw);
  if (!Number.isInteger(spots) || spots < 1 || spots > LIMITS.maxSpots) return `Enter a whole number from 1 to ${LIMITS.maxSpots}.`;
  return undefined;
};

export type EventDetailsField = "starts_at" | "neighborhood" | "venue_name" | "address";
export const DETAILS_FIELDS: readonly EventDetailsField[] = ["starts_at", "neighborhood", "venue_name", "address"];

/** The date/time and place of a meetup: what a host can change after posting. */
export function validateEventDetails(input: Record<string, string>): Partial<Record<EventDetailsField, string>> {
  const v = (k: EventDetailsField) => (input[k] ?? "").trim();
  const errors: Partial<Record<EventDetailsField, string>> = {};
  const checks: [EventDetailsField, string | undefined][] = [
    ["neighborhood", neighborhoodError(v("neighborhood"))],
    ["venue_name", venueError(v("venue_name"))],
    ["address", addressError(v("address"))],
    ["starts_at", startsAtError(v("starts_at"))],
  ];
  for (const [field, message] of checks) if (message) errors[field] = message;
  return errors;
}

/** What a host can change after posting: date/time, place and the number of spots. */
export type EditField = EventDetailsField | "max_spots";
export const EDIT_FIELDS: readonly EditField[] = [...DETAILS_FIELDS, "max_spots"];

export function validateEventEdit(input: Record<string, string>): Partial<Record<EditField, string>> {
  const errors: Partial<Record<EditField, string>> = { ...validateEventDetails(input) };
  const spots = maxSpotsError((input.max_spots ?? "").trim());
  if (spots) errors.max_spots = spots;
  return errors;
}

/** Shared by the form (client) and the server action so the rules can't drift. */
export function validateEvent(input: Record<string, string>): EventErrors {
  const errors: EventErrors = {};
  const v = (k: EventField) => (input[k] ?? "").trim();

  if (!v("title")) errors.title = "Give your meetup a title.";
  else if (v("title").length > LIMITS.title)
    errors.title = `Keep it under ${LIMITS.title} characters.`;

  if (!isCategory(v("category"))) errors.category = "Pick a category.";
  const place = validateEventDetails(input);
  if (place.neighborhood) errors.neighborhood = place.neighborhood;
  if (place.venue_name) errors.venue_name = place.venue_name;
  if (place.address) errors.address = place.address;
  if (place.starts_at) errors.starts_at = place.starts_at;

  const spotsProblem = maxSpotsError(v("max_spots"));
  if (spotsProblem) errors.max_spots = spotsProblem;

  if (v("description").length > LIMITS.description)
    errors.description = `Keep it under ${LIMITS.description} characters.`;

  if (!isSkillLevel(v("skill_level"))) errors.skill_level = "Pick a skill level.";
  if (!isAudience(v("audience"))) errors.audience = "Pick who it's for.";
  if (!isJoinMode(v("join_mode"))) errors.join_mode = "Choose who can join.";
  const minProblem = ageFieldProblem(v("age_min"));
  const maxProblem = ageFieldProblem(v("age_max"));
  if (minProblem) errors.age_min = minProblem;
  if (maxProblem) errors.age_max = maxProblem;
  if (!minProblem && !maxProblem && v("age_min") !== "" && v("age_max") !== "" && Number(v("age_max")) < Number(v("age_min"))) {
    errors.age_max = "The oldest age can't be lower than the youngest.";
  }

  if (v("chat_url")) {
    const parsed = parseChatUrl(v("chat_url"));
    if ("error" in parsed) errors.chat_url = parsed.error;
  }

  return errors;
}

export const NOTE_MAX = 500;

/** The optional note a person can add when asking to join an approval-only event. */
export function validateRequestNote(note: string): string | undefined {
  if (note.trim().length > NOTE_MAX) return `Keep it under ${NOTE_MAX} characters.`;
  return undefined;
}
