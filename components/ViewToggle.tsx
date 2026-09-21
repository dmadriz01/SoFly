"use client";

import Link from "next/link";
import { feedHref, type FeedFilters } from "@/lib/feed";

/** List or Swipe. Remembers the choice in a cookie so the feed opens the way you left it. */
export function ViewToggle({ filters, active }: { filters: FeedFilters; active: "swipe" | "list" }) {
  const remember = (view: "swipe" | "list") => {
    try {
      document.cookie = `bm_view=${view}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // Cookies blocked: the choice just won't be remembered.
    }
  };
  const seg = (on: boolean) =>
    `tap rounded-full px-4 text-sm font-semibold transition ${
      on ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
    }`;

  return (
    <div role="group" aria-label="View" className="inline-flex shrink-0 rounded-full bg-line/70 p-1">
      <Link
        href={feedHref({ ...filters, view: "list" })}
        onClick={() => remember("list")}
        className={seg(active === "list")}
        aria-current={active === "list" ? "true" : undefined}
      >
        List
      </Link>
      <Link
        href={feedHref({ ...filters, view: "swipe" })}
        onClick={() => remember("swipe")}
        className={seg(active === "swipe")}
        aria-current={active === "swipe" ? "true" : undefined}
      >
        Swipe
      </Link>
    </div>
  );
}
