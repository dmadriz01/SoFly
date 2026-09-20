"use client";

import { useRouter } from "next/navigation";
import { CATEGORY_GROUPS, SKILL_LEVELS } from "@/lib/constants";
import { feedHref, type FeedFilters } from "@/lib/feed";
import { NeighborhoodOptions } from "./NeighborhoodOptions";

/** The feed's dropdown filters. Changing one navigates, keeping the rest in the URL. */
export function FeedSelects({ filters }: { filters: FeedFilters }) {
  const router = useRouter();
  const go = (patch: Partial<FeedFilters>) => router.push(feedHref({ ...filters, ...patch }));
  const select = "field min-w-0 w-full !py-2 text-sm";

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <select
        aria-label="Category"
        value={filters.category ?? ""}
        onChange={(e) => go({ category: e.target.value || undefined })}
        className={select}
      >
        <option value="">All categories</option>
        {CATEGORY_GROUPS.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.items.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <select
        aria-label="Neighborhood"
        value={filters.neighborhood ?? ""}
        onChange={(e) => go({ neighborhood: e.target.value || undefined })}
        className={select}
      >
        <option value="">All neighborhoods</option>
        <NeighborhoodOptions />
      </select>

      <select
        aria-label="Skill level"
        value={filters.level ?? ""}
        onChange={(e) => go({ level: e.target.value || undefined })}
        className={`${select} col-span-2 sm:col-span-1`}
      >
        <option value="">Any skill level</option>
        {SKILL_LEVELS.filter((l) => l !== "All levels").map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
