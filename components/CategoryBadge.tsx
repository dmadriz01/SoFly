import { CATEGORY_STYLES, categoryLabel, isCategory } from "@/lib/constants";

/** The kind of meetup. For "Other ..." meetups it shows the host's own name for it ("Frisbee golf"). */
export function CategoryBadge({ category, activity }: { category: string; activity?: string | null }) {
  const style = isCategory(category) ? CATEGORY_STYLES[category] : CATEGORY_STYLES.Other;
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${style}`}>
      {categoryLabel(category, activity)}
    </span>
  );
}
