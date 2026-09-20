import Link from "next/link";
import { feedHref, type FeedFilters } from "@/lib/feed";

const chip = (active: boolean) =>
  `tap shrink-0 rounded-full border px-4 text-sm font-medium transition ${
    active
      ? "border-accent bg-accent-soft text-accent-dark"
      : "border-line bg-white text-ink hover:border-accent/50"
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
      <Link
        href={feedHref({ ...filters, women: !filters.women })}
        className={chip(Boolean(filters.women))}
        aria-pressed={Boolean(filters.women)}
      >
        {filters.women ? "✓ " : ""}Women-only
      </Link>
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
