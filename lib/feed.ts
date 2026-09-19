/** Build a feed URL with the given filters in the query string. */
export function feedHref({
  category,
  neighborhood,
}: {
  category?: string;
  neighborhood?: string;
}) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (neighborhood) params.set("neighborhood", neighborhood);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}
