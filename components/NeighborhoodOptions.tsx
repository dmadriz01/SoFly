import { NEIGHBORHOOD_GROUPS } from "@/lib/constants";
import type { CityGroup } from "@/lib/cities";

/** Grouped <option>s so ~100 places stay easy to scan. Pass one city's groups; with none, every place. */
export function NeighborhoodOptions({ groups = NEIGHBORHOOD_GROUPS }: { groups?: readonly CityGroup[] }) {
  return (
    <>
      {groups.map((g) => (
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
