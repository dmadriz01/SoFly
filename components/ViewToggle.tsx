import Link from "next/link";
import { feedHref, type FeedFilters } from "@/lib/feed";

/** List or Swipe. Keeps the current filters. */
export function ViewToggle({ filters }: { filters: FeedFilters }) {
  const swipe = filters.view === "swipe";
  const seg = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-semibold transition ${
      active ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"
    }`;
  return (
    <div role="group" aria-label="View" className="inline-flex rounded-full bg-line/70 p-1">
      <Link
        href={feedHref({ ...filters, view: undefined })}
        className={seg(!swipe)}
        aria-current={!swipe ? "true" : undefined}
      >
        List
      </Link>
      <Link
        href={feedHref({ ...filters, view: "swipe" })}
        className={seg(swipe)}
        aria-current={swipe ? "true" : undefined}
      >
        Swipe
      </Link>
    </div>
  );
}
