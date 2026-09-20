import { cookies } from "next/headers";
import Link from "next/link";
import { EventCard } from "@/components/EventCard";
import { FeedSelects } from "@/components/Filters";
import { FilterChips } from "@/components/FilterChips";
import { Hero } from "@/components/Hero";
import { SwipeDeck, type DeckEvent } from "@/components/SwipeDeck";
import { ViewToggle } from "@/components/ViewToggle";
import { ageLabel, ageOn, withinAgeRange } from "@/lib/age";
import { isCategory, isNeighborhood, isSkillLevel } from "@/lib/constants";
import { feedHref, type FeedFilters } from "@/lib/feed";
import { getInterests } from "@/lib/interests";
import { hasAbout } from "@/lib/about";
import { getAbout, getBirthDate } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { formatWhenShort, pacificDate } from "@/lib/time";
import type { EventWithCount } from "@/lib/types";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type EventWithHost = EventWithCount & {
  host: { name: string } | null;
  // Row level security only returns the people the viewer is allowed to see.
  rsvps: { status: string; profiles: { name: string } | null }[];
};

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
    // ?women=1 is the older form of this link; keep it working.
    audience:
      one(searchParams.audience) === "men"
        ? "Men-only"
        : one(searchParams.audience) === "women" || one(searchParams.women) === "1"
          ? "Women-only"
          : undefined,
    eligible: one(searchParams.eligible) === "1",
    view: ["swipe", "list"].includes(one(searchParams.view) ?? "")
      ? (one(searchParams.view) as "swipe" | "list")
      : undefined,
  };
  // An explicit choice wins; otherwise use the view they last picked (remembered in a cookie).
  const activeView = filters.view ?? (cookies().get("bm_view")?.value === "swipe" ? "swipe" : "list");
  const swipe = activeView === "swipe";

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [birthDate, interests] = user
    ? await Promise.all([getBirthDate(supabase, user.id), getInterests(supabase, user.id)])
    : [null, null];

  let query = supabase
    .from("events")
    .select("*, host:profiles!host_id(name), rsvps(status, profiles(name))")
    .is("cancelled_at", null)
    .gt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(100);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.neighborhood) query = query.eq("neighborhood", filters.neighborhood);
  // "Beginner" also matches all-levels events, which welcome beginners too.
  if (filters.level) query = query.in("skill_level", [filters.level, "All levels"]);
  if (filters.audience) query = query.eq("audience", filters.audience);

  const { data, error } = await query;
  const fitsAge = (e: EventWithCount) =>
    !birthDate ||
    withinAgeRange(ageOn(birthDate, pacificDate(new Date(e.starts_at))), e.age_min, e.age_max);

  let events = (data ?? []) as EventWithHost[];
  if (filters.eligible && birthDate) events = events.filter(fitsAge);

  const filtered = Boolean(
    filters.category || filters.neighborhood || filters.level || filters.audience || filters.eligible
  );
  // Names of approved guests, for open events only (approval-only events keep guest lists private).
  const goingNames = (e: EventWithHost) =>
    e.join_mode === "request"
      ? []
      : e.rsvps
          .filter((r) => r.status === "approved" && r.profiles?.name?.trim())
          .map((r) => r.profiles!.name);
  const interestSet = new Set(interests ?? []);
  const matchesInterests = (e: EventWithCount) => interestSet.has(e.category);

  const header = (
    <>
      {user ? (
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">What&rsquo;s happening</h1>
            <p className="mt-1 text-muted">Find people to play with around the Bay.</p>
          </div>
          <ViewToggle filters={filters} active={activeView} />
        </div>
      ) : (
        <>
          <Hero />
          <div className="flex items-center justify-between gap-3" id="feed">
            <h2 className="text-lg font-bold">Happening soon</h2>
            <ViewToggle filters={filters} active={activeView} />
          </div>
        </>
      )}
      <FeedSelects filters={filters} />
      <FilterChips filters={filters} showEligible={Boolean(birthDate)} />
    </>
  );

  if (error) {
    return (
      <div className="space-y-4">
        {header}
        <p className="card p-4 text-sm text-muted">
          Couldn&rsquo;t load meetups right now. Please refresh in a moment.
        </p>
      </div>
    );
  }

  // ---- Swipe view ----
  if (swipe) {
    let seen = new Set<string>();
    if (user) {
      const [mine, passes] = await Promise.all([
        supabase.from("rsvps").select("event_id").eq("user_id", user.id),
        supabase.from("event_passes").select("event_id").eq("user_id", user.id),
      ]);
      seen = new Set([
        ...(mine.data ?? []).map((r) => r.event_id as string),
        ...(passes.data ?? []).map((r) => r.event_id as string),
      ]);
    }

    // Only show what the viewer could actually join, matches for their interests first.
    const candidates = events
      .filter((e) => e.spots_taken < e.max_spots && e.host_id !== user?.id && !seen.has(e.id) && fitsAge(e))
      .sort((a, b) => Number(matchesInterests(b)) - Number(matchesInterests(a)));

    const deck: DeckEvent[] = candidates.map((e) => {
      const age = ageLabel(e.age_min, e.age_max);
      return {
        id: e.id,
        title: e.title,
        category: e.category,
        when: formatWhenShort(e.starts_at),
        neighborhood: e.neighborhood,
        venue: e.venue_name,
        spotsLeft: Math.max(e.max_spots - e.spots_taken, 0),
        maxSpots: e.max_spots,
        blurb: e.description.slice(0, 220),
        hostName: e.host?.name?.trim() || "the host",
        requestMode: e.join_mode === "request",
        matchesInterests: matchesInterests(e),
        tags: [
          e.audience !== "Everyone" ? e.audience : null,
          e.skill_level !== "All levels" ? e.skill_level : null,
          age ? (e.age_max == null ? age : `Ages ${age}`) : null,
          e.join_mode === "request" ? "Approval required" : null,
        ].filter((t): t is string => Boolean(t)),
      };
    });

    return (
      <div className="space-y-4">
        {header}
        <SwipeDeck
          // A new key when the filters change resets which cards were swiped away.
          key={feedHref({ ...filters, view: "swipe" })}
          events={deck}
          loggedIn={Boolean(user)}
          hasProfile={Boolean(birthDate)}
          hasAbout={user ? hasAbout(await getAbout(supabase, user.id)) : false}
          returnTo={feedHref({ ...filters, view: "swipe" })}
          listHref={feedHref({ ...filters, view: "list" })}
        />
      </div>
    );
  }

  // ---- List view ----
  // With no filters on, lead with events that match the viewer's interests.
  const suggested = !filtered && interestSet.size > 0 ? events.filter(matchesInterests).slice(0, 6) : [];
  const suggestedIds = new Set(suggested.map((e) => e.id));
  const rest = events.filter((e) => !suggestedIds.has(e.id));

  return (
    <div className="space-y-4">
      {header}

      {events.length === 0 ? (
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
              <Link href={feedHref({ view: filters.view })} className="tap text-sm font-medium text-accent-dark underline">
                Clear filters
              </Link>
            </div>
          )}
        </div>
      ) : (
        <>
          {suggested.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-accent-dark">
                Picked for you
              </h2>
              <ul className="space-y-3">
                {suggested.map((event, i) => (
                  <li key={event.id} className="fade-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                    <EventCard event={event} attendees={goingNames(event)} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {rest.length > 0 && (
            <section className="space-y-3">
              {suggested.length > 0 && (
                <h2 className="pt-2 text-sm font-bold uppercase tracking-wide text-muted">
                  More happening
                </h2>
              )}
              <ul className="space-y-3">
                {rest.map((event, i) => (
                  <li key={event.id} className="fade-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                    <EventCard event={event} attendees={goingNames(event)} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
