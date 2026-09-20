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

/** Shared by the form (client) and the server action so the rules can't drift. */
export function validateEvent(input: Record<string, string>): EventErrors {
  const errors: EventErrors = {};
  const v = (k: EventField) => (input[k] ?? "").trim();

  if (!v("title")) errors.title = "Give your meetup a title.";
  else if (v("title").length > LIMITS.title)
    errors.title = `Keep it under ${LIMITS.title} characters.`;

  if (!isCategory(v("category"))) errors.category = "Pick a category.";
  if (!isNeighborhood(v("neighborhood")))
    errors.neighborhood = "Pick a neighborhood.";

  if (!v("venue_name")) errors.venue_name = "Where are you meeting?";
  else if (v("venue_name").length > LIMITS.venue_name)
    errors.venue_name = `Keep it under ${LIMITS.venue_name} characters.`;

  if (!v("address")) errors.address = "Add the full address so people can find you.";
  else if (v("address").length > LIMITS.address)
    errors.address = `Keep it under ${LIMITS.address} characters.`;

  if (!v("starts_at")) errors.starts_at = "Pick a date and time.";
  else {
    const when = pacificLocalToUtc(v("starts_at"));
    if (!when) errors.starts_at = "That isn't a valid date and time.";
    else if (when.getTime() <= Date.now())
      errors.starts_at = "Pick a time in the future.";
  }

  const spots = Number(v("max_spots"));
  if (!v("max_spots")) errors.max_spots = "How many people can join?";
  else if (!Number.isInteger(spots) || spots < 1 || spots > LIMITS.maxSpots)
    errors.max_spots = `Enter a whole number from 1 to ${LIMITS.maxSpots}.`;

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

export function validateMaxSpots(value: number): string | undefined {
  if (!Number.isInteger(value) || value < 1 || value > LIMITS.maxSpots)
    return `Enter a whole number from 1 to ${LIMITS.maxSpots}.`;
  return undefined;
}
