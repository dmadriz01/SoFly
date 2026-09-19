"use client";

import { useRouter } from "next/navigation";
import { NEIGHBORHOODS } from "@/lib/constants";
import { feedHref } from "@/lib/feed";

export function NeighborhoodSelect({
  category,
  neighborhood,
}: {
  category?: string;
  neighborhood?: string;
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <span className="shrink-0">Neighborhood</span>
      <select
        value={neighborhood ?? ""}
        onChange={(e) => router.push(feedHref({ category, neighborhood: e.target.value }))}
        className="field !w-auto min-w-0 flex-1 !py-2 text-sm"
      >
        <option value="">All neighborhoods</option>
        {NEIGHBORHOODS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}
