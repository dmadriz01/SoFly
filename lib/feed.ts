export type FeedFilters = {
  category?: string;
  neighborhood?: string;
  level?: string;
  women?: boolean;
  eligible?: boolean;
  /** "swipe" shows the card deck; anything else is the list. */
  view?: "swipe";
};

/** Build a feed URL with the given filters in the query string. */
export function feedHref(filters: FeedFilters) {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.neighborhood) params.set("neighborhood", filters.neighborhood);
  if (filters.level) params.set("level", filters.level);
  if (filters.women) params.set("women", "1");
  if (filters.eligible) params.set("eligible", "1");
  if (filters.view === "swipe") params.set("view", "swipe");
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}
