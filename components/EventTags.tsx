import { ageLabel } from "@/lib/age";
import type { EventRow } from "@/lib/types";

type Rules = Pick<EventRow, "skill_level" | "audience" | "age_min" | "age_max">;

const tag = "inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold";

/** Pills for anything that narrows who an event is for. Defaults render nothing. */
export function EventTags({ event }: { event: Rules }) {
  const age = ageLabel(event.age_min, event.age_max);
  return (
    <>
      {event.audience === "Women-only" && (
        <span className={`${tag} bg-accent-soft text-accent-dark`}>Women-only</span>
      )}
      {event.skill_level && event.skill_level !== "All levels" && (
        <span className={`${tag} border border-line bg-white text-ink`}>{event.skill_level}</span>
      )}
      {age && (
        <span className={`${tag} border border-line bg-white text-ink`}>
          {event.age_max == null ? age : `Ages ${age}`}
        </span>
      )}
    </>
  );
}
