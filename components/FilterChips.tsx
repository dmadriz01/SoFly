import Link from "next/link";
import { feedHref, type FeedFilters } from "@/lib/feed";

const chip = (active: boolean) =>
  `tap shrink-0 rounded-full border px-4 text-sm font-medium transition ${
    active
      ? "border-accent bg-accent-soft text-accent-dark"
      : "border-line bg-surface text-ink hover:border-accent/50"
  }`;

/** On/off filters: tap to turn one on, tap again to turn it off. */
export function FilterChips({
  filters,
  showEligible,
}: {
  filters: FeedFilters;
  showEligible: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(["Women-only", "Men-only"] as const).map((group) => {
        const on = filters.audience === group;
        return (
          <Link
            key={group}
            href={feedHref({ ...filters, audience: on ? undefined : group })}
            className={chip(on)}
            aria-pressed={on}
          >
            {on ? "✓ " : ""}
            {group}
          </Link>
        );
      })}
      {showEligible && (
        <Link
          href={feedHref({ ...filters, eligible: !filters.eligible })}
          className={chip(Boolean(filters.eligible))}
          aria-pressed={Boolean(filters.eligible)}
        >
          {filters.eligible ? "✓ " : ""}Fits my age
        </Link>
      )}
    </div>
  );
}
