import Link from "next/link";
import { CATEGORIES } from "@/lib/constants";
import { feedHref, type FeedFilters } from "@/lib/feed";

export function CategoryPills({ filters }: { filters: FeedFilters }) {
  const { category } = filters;
  const pill = (active: boolean) =>
    `shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
      active
        ? "border-accent bg-accent text-white"
        : "border-line bg-white text-ink hover:border-accent/50"
    }`;

  return (
    <div className="no-scrollbar -mx-4 overflow-x-auto px-4">
      <div className="flex w-max gap-2">
        <Link
          href={feedHref({ ...filters, category: undefined })}
          className={pill(!category)}
          aria-current={!category ? "true" : undefined}
        >
          All
        </Link>
        {CATEGORIES.map((c) => (
          <Link
            key={c}
            href={feedHref({ ...filters, category: c })}
            className={pill(category === c)}
            aria-current={category === c ? "true" : undefined}
          >
            {c}
          </Link>
        ))}
      </div>
    </div>
  );
}
