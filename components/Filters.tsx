"use client";

import { useRouter } from "next/navigation";
import { SKILL_LEVELS } from "@/lib/constants";
import { feedHref, type FeedFilters } from "@/lib/feed";
import { NeighborhoodOptions } from "./NeighborhoodOptions";

export function FeedSelects({ filters }: { filters: FeedFilters }) {
  const router = useRouter();
  const go = (patch: Partial<FeedFilters>) => router.push(feedHref({ ...filters, ...patch }));

  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="col-span-2 flex items-center gap-2 text-sm text-muted sm:col-span-1">
        <span className="sr-only sm:not-sr-only sm:shrink-0">Where</span>
        <select
          aria-label="Neighborhood"
          value={filters.neighborhood ?? ""}
          onChange={(e) => go({ neighborhood: e.target.value || undefined })}
          className="field min-w-0 flex-1 !py-2 text-sm"
        >
          <option value="">All neighborhoods</option>
          <NeighborhoodOptions />
        </select>
      </label>
      <label className="col-span-2 flex items-center gap-2 text-sm text-muted sm:col-span-1">
        <span className="sr-only sm:not-sr-only sm:shrink-0">Level</span>
        <select
          aria-label="Skill level"
          value={filters.level ?? ""}
          onChange={(e) => go({ level: e.target.value || undefined })}
          className="field min-w-0 flex-1 !py-2 text-sm"
        >
          <option value="">Any skill level</option>
          {SKILL_LEVELS.filter((l) => l !== "All levels").map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
