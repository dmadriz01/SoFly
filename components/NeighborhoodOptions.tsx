import { NEIGHBORHOOD_GROUPS } from "@/lib/constants";

/** Grouped <option>s so ~100 places stay easy to scan. */
export function NeighborhoodOptions() {
  return (
    <>
      {NEIGHBORHOOD_GROUPS.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.items.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
