import Link from "next/link";
import { CategoryPills } from "@/components/CategoryPills";
import { EventCard } from "@/components/EventCard";
import { FeedSelects } from "@/components/Filters";
import { FilterChips } from "@/components/FilterChips";
import { ageOn, withinAgeRange } from "@/lib/age";
import { isCategory, isNeighborhood, isSkillLevel } from "@/lib/constants";
import type { FeedFilters } from "@/lib/feed";
import { getBirthDate } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { pacificDate } from "@/lib/time";
import type { EventWithCount } from "@/lib/types";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const rawCategory = one(searchParams.category);
  const rawNeighborhood = one(searchParams.neighborhood);
  const rawLevel = one(searchParams.level);
  const filters: FeedFilters = {
    category: isCategory(rawCategory) ? rawCategory : undefined,
    neighborhood: isNeighborhood(rawNeighborhood) ? rawNeighborhood : undefined,
    level: isSkillLevel(rawLevel) && rawLevel !== "All levels" ? rawLevel : undefined,
    women: one(searchParams.women) === "1",
    eligible: one(searchParams.eligible) === "1",
  };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const birthDate = user ? await getBirthDate(supabase, user.id) : null;
  // "Fits my age" only makes sense once we know the viewer's age.
  const canFilterByAge = Boolean(birthDate);

  let query = supabase
    .from("events")
    .select("*, rsvps(count)")
    .is("cancelled_at", null)
    .gt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(100);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.neighborhood) query = query.eq("neighborhood", filters.neighborhood);
  // "Beginner" also matches all-levels events, which welcome beginners too.
  if (filters.level) query = query.in("skill_level", [filters.level, "All levels"]);
  if (filters.women) query = query.eq("audience", "Women-only");

  const { data, error } = await query;
  let events = (data ?? []) as EventWithCount[];
  if (filters.eligible && birthDate) {
    events = events.filter((e) =>
      withinAgeRange(ageOn(birthDate, pacificDate(new Date(e.starts_at))), e.age_min, e.age_max)
    );
  }
  const filtered = Boolean(
    filters.category || filters.neighborhood || filters.level || filters.women || filters.eligible
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">What&rsquo;s happening</h1>
        <p className="mt-1 text-muted">Find people to play with around the Bay.</p>
      </div>

      <CategoryPills filters={filters} />
      <FilterChips filters={filters} showEligible={canFilterByAge} />
      <FeedSelects filters={filters} />

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
