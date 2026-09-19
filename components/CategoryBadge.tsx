import { CATEGORY_STYLES, isCategory } from "@/lib/constants";

export function CategoryBadge({ category }: { category: string }) {
  const style = isCategory(category) ? CATEGORY_STYLES[category] : CATEGORY_STYLES.Other;
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${style}`}>
      {category}
    </span>
  );
}
