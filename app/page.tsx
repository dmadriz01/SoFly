import Link from "next/link";
import { CategoryPills } from "@/components/CategoryPills";
import { EventCard } from "@/components/EventCard";
import { NeighborhoodSelect } from "@/components/Filters";
import { isCategory, isNeighborhood } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { EventWithCount } from "@/lib/types";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function FeedPage({
  searchParams,
}: {
  searchParams: { category?: string | string[]; neighborhood?: string | string[] };
}) {
  const rawCategory = one(searchParams.category);
  const rawNeighborhood = one(searchParams.neighborhood);
  const category = isCategory(rawCategory) ? rawCategory : undefined;
  const neighborhood = isNeighborhood(rawNeighborhood) ? rawNeighborhood : undefined;

  const supabase = createClient();
  let query = supabase
    .from("events")
    .select("*, rsvps(count)")
    .is("cancelled_at", null)
    .gt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(100);
  if (category) query = query.eq("category", category);
  if (neighborhood) query = query.eq("neighborhood", neighborhood);

  const { data, error } = await query;
  const events = (data ?? []) as EventWithCount[];
  const filtered = Boolean(category || neighborhood);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">What&rsquo;s happening</h1>
        <p className="mt-1 text-muted">Find people to play with around the Bay.</p>
      </div>

      <CategoryPills category={category} neighborhood={neighborhood} />
      <NeighborhoodSelect category={category} neighborhood={neighborhood} />

      {error ? (
        <p className="card p-4 text-sm text-muted">
          Couldn&rsquo;t load meetups right now. Please refresh in a moment.
        </p>
      ) : events.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <p className="text-lg font-semibold">
            {filtered ? "Nothing matches those filters yet" : "No meetups on the calendar yet"}
          </p>
          <p className="mx-auto mt-1 max-w-xs text-muted">
            Someone has to get the ball rolling. Might as well be you.
          </p>
          <Link href="/events/new" className="btn-primary mt-6">
            Post the first one
          </Link>
          {filtered && (
            <div className="mt-4">
              <Link href="/" className="text-sm font-medium text-accent-dark underline">
                Clear filters
              </Link>
            </div>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {events.map((event) => (
            <li key={event.id}>
              <EventCard event={event} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
