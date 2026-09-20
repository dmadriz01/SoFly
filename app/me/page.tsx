import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { EventCard } from "@/components/EventCard";
import { getBirthDate } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import type { EventWithCount } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Upcoming first (soonest first), then past events (most recent first). */
function upcomingThenPast(events: EventWithCount[]) {
  const now = Date.now();
  const time = (e: EventWithCount) => new Date(e.starts_at).getTime();
  const isPast = (e: EventWithCount) => time(e) <= now || Boolean(e.cancelled_at);
  return {
    upcoming: events.filter((e) => !isPast(e)).sort((a, b) => time(a) - time(b)),
    past: events.filter(isPast).sort((a, b) => time(b) - time(a)),
  };
}

function Section({
  title,
  events,
  empty,
  pendingByEvent = {},
  statusByEvent = {},
}: {
  title: string;
  events: EventWithCount[];
  empty: React.ReactNode;
  pendingByEvent?: Record<string, number>;
  statusByEvent?: Record<string, string>;
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
              <EventCard event={e} pendingRequests={pendingByEvent[e.id]} myStatus={statusByEvent[e.id]} />
            </li>
          ))}
          {past.map((e) => (
            <li key={e.id}>
              <EventCard event={e} past myStatus={statusByEvent[e.id]} />
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
  if (!(await getBirthDate(supabase, user.id))) redirect("/welcome?next=/me");

  const [hostingRes, myRsvps] = await Promise.all([
    supabase.from("events").select("*").eq("host_id", user.id),
    // Approved and pending only; a declined request just drops off this list.
    supabase
      .from("rsvps")
      .select("event_id, status")
      .eq("user_id", user.id)
      .in("status", ["approved", "pending"]),
  ]);

  const hosting = (hostingRes.data ?? []) as EventWithCount[];
  const myRows = (myRsvps.data ?? []) as { event_id: string; status: string }[];
  const goingIds = myRows.map((r) => r.event_id);
  const statusByEvent = Object.fromEntries(myRows.map((r) => [r.event_id, r.status]));

  // Pending rows that aren't mine are requests waiting on me (only the host can see them).
  const pendingByEvent: Record<string, number> = {};
  if (hosting.length > 0) {
    const { data: waiting } = await supabase
      .from("rsvps")
      .select("event_id")
      .eq("status", "pending")
      .neq("user_id", user.id)
      .in("event_id", hosting.map((e) => e.id));
    for (const r of waiting ?? []) {
      pendingByEvent[r.event_id] = (pendingByEvent[r.event_id] ?? 0) + 1;
    }
  }

  let going: EventWithCount[] = [];
  if (goingIds.length > 0) {
    const { data } = await supabase
      .from("events")
      .select("*")
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
        pendingByEvent={pendingByEvent}
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
        statusByEvent={statusByEvent}
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
