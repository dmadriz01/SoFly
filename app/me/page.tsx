import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { EventCard } from "@/components/EventCard";
import { createClient } from "@/lib/supabase/server";
import type { EventWithCount } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Upcoming first (soonest first), then past events (most recent first). */
function upcomingThenPast(events: EventWithCount[]) {
  const now = Date.now();
  const time = (e: EventWithCount) => new Date(e.starts_at).getTime();
  return {
    upcoming: events.filter((e) => time(e) > now).sort((a, b) => time(a) - time(b)),
    past: events.filter((e) => time(e) <= now).sort((a, b) => time(b) - time(a)),
  };
}

function Section({
  title,
  events,
  empty,
}: {
  title: string;
  events: EventWithCount[];
  empty: React.ReactNode;
}) {
  const { upcoming, past } = upcomingThenPast(events);
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {events.length === 0 ? (
        <p className="card p-4 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {upcoming.map((e) => (
            <li key={e.id}>
              <EventCard event={e} />
            </li>
          ))}
          {past.map((e) => (
            <li key={e.id}>
              <EventCard event={e} past />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function MePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me");

  const [hostingRes, myRsvps] = await Promise.all([
    supabase.from("events").select("*, rsvps(count)").eq("host_id", user.id),
    supabase.from("rsvps").select("event_id").eq("user_id", user.id),
  ]);

  const hosting = (hostingRes.data ?? []) as EventWithCount[];
  const goingIds = (myRsvps.data ?? []).map((r) => r.event_id as string);

  let going: EventWithCount[] = [];
  if (goingIds.length > 0) {
    const { data } = await supabase
      .from("events")
      .select("*, rsvps(count)")
      .in("id", goingIds);
    going = (data ?? []) as EventWithCount[];
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My meetups</h1>
          <p className="mt-1 break-all text-sm text-muted">{user.email}</p>
        </div>
        <form action={signOut}>
          <button className="btn-secondary !px-4 !py-2 text-sm">Log out</button>
        </form>
      </div>

      <Section
        title="Hosting"
        events={hosting}
        empty={
          <>
            You aren&rsquo;t hosting anything yet.{" "}
            <Link href="/events/new" className="font-medium text-accent-dark underline">
              Post a meetup
            </Link>
          </>
        }
      />
      <Section
        title="Going to"
        events={going}
        empty={
          <>
            You haven&rsquo;t joined anything yet.{" "}
            <Link href="/" className="font-medium text-accent-dark underline">
              Browse the feed
            </Link>
          </>
        }
      />
    </div>
  );
}
