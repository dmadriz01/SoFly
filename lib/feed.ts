export type FeedFilters = {
  category?: string;
  neighborhood?: string;
  level?: string;
  /** Only meetups set for one group. Unset means all of them. */
  audience?: "Women-only" | "Men-only";
  eligible?: boolean;
  /** Set only when someone picks a view explicitly; otherwise their remembered choice applies. */
  view?: "swipe" | "list";
};

/** Build a feed URL with the given filters in the query string. */
export function feedHref(filters: FeedFilters) {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.neighborhood) params.set("neighborhood", filters.neighborhood);
  if (filters.level) params.set("level", filters.level);
  if (filters.audience) params.set("audience", filters.audience === "Women-only" ? "women" : "men");
  if (filters.eligible) params.set("eligible", "1");
  if (filters.view) params.set("view", filters.view);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}
