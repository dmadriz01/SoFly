import Link from "next/link";
import { redirect } from "next/navigation";
import { AboutForm } from "@/components/AboutForm";
import { EmailSettings } from "@/components/EmailSettings";
import { LogoutButton } from "@/components/LogoutButton";
import { PushSettings } from "@/components/PushSettings";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FeedbackPrompt } from "@/components/FeedbackPrompt";
import { EventCard } from "@/components/EventCard";
import { NextUp } from "@/components/NextUp";
import { InterestsForm } from "@/components/InterestsForm";
import { isAdminUser } from "@/lib/admin-access";
import { getInterests } from "@/lib/interests";
import { getAbout, getBirthDate } from "@/lib/profile";
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
    // Everything you've joined or asked to join, including requests the host declined.
    supabase
      .from("rsvps")
      .select("event_id, status")
      .eq("user_id", user.id)
      .in("status", ["approved", "pending", "declined"]),
  ]);

  const interests = (await getInterests(supabase, user.id)) ?? [];
  const { data: settings } = await supabase
    .from("user_settings")
    .select("email_notifications")
    .eq("user_id", user.id)
    .maybeSingle();
  const emailsOn = settings?.email_notifications ?? true;
  const about = await getAbout(supabase, user.id);
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

  // The soonest upcoming meetup you're hosting or approved for.
  const soon = [
    ...hosting.map((e) => ({ e, role: "hosting" as const })),
    ...going
      .filter((e) => statusByEvent[e.id] === "approved" && e.host_id !== user.id)
      .map((e) => ({ e, role: "going" as const })),
  ]
    .filter(({ e }) => !e.cancelled_at && new Date(e.starts_at).getTime() > Date.now())
    .sort((a, b) => new Date(a.e.starts_at).getTime() - new Date(b.e.starts_at).getTime())[0];

  let nextVenue: string | null = null;
  let nextAddress: string | null = null;
  if (soon) {
    nextVenue = soon.e.venue_name;
    nextAddress = soon.e.address;
    if (soon.e.join_mode === "request") {
      // The real place is private; you can see it because you're the host or approved.
      const { data: loc } = await supabase
        .from("event_locations")
        .select("venue_name, address")
        .eq("event_id", soon.e.id)
        .maybeSingle();
      nextVenue = loc?.venue_name ?? null;
      nextAddress = loc?.address ?? null;
    }
  }

  // Meetups you went to in the last two weeks and haven't rated yet.
  const twoWeeksAgo = Date.now() - 14 * 24 * 3600e3;
  const recent = going
    .filter(
      (e) =>
        statusByEvent[e.id] === "approved" &&
        e.host_id !== user.id &&
        !e.cancelled_at &&
        new Date(e.starts_at).getTime() < Date.now() &&
        new Date(e.starts_at).getTime() > twoWeeksAgo
    )
    .slice(0, 3);
  let toRate = recent;
  if (recent.length > 0) {
    const { data: answered } = await supabase
      .from("meetup_feedback")
      .select("event_id")
      .in("event_id", recent.map((e) => e.id));
    const done = new Set((answered ?? []).map((a) => a.event_id as string));
    toRate = recent.filter((e) => !done.has(e.id));
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My meetups</h1>
          <p className="mt-1 break-all text-sm text-muted">{user.email}</p>
        </div>
        <LogoutButton />
      </div>

      {isAdminUser(user) && (
        <Link href="/admin" className="card flex items-center justify-between p-4 text-sm font-semibold hover:border-accent/50">
          Admin dashboard <span aria-hidden="true">&rarr;</span>
        </Link>
      )}

      {soon && (
        <NextUp
          id={soon.e.id}
          title={soon.e.title}
          category={soon.e.category}
          neighborhood={soon.e.neighborhood}
          skill={soon.e.skill_level}
          maxSpots={soon.e.max_spots}
          startsAt={soon.e.starts_at}
          venue={nextVenue}
          address={nextAddress}
          role={soon.role}
        />
      )}

      {toRate.map((e) => (
        <FeedbackPrompt key={e.id} eventId={e.id} title={e.title} initial={null} />
      ))}

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
        events={going.filter((e) => statusByEvent[e.id] !== "declined")}
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

      {going.some((e) => statusByEvent[e.id] === "declined") && (
        <section>
          <h2 className="mb-1 text-lg font-bold">Declined</h2>
          <p className="mb-3 text-sm text-muted">
            Hosts couldn&rsquo;t fit you into these. It isn&rsquo;t a judgment on you: small meetups have limited spots.
          </p>
          <ul className="space-y-3">
            {going
              .filter((e) => statusByEvent[e.id] === "declined")
              .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
              .map((e) => (
                <li key={e.id}>
                  <EventCard event={e} past myStatus="declined" />
                </li>
              ))}
          </ul>
        </section>
      )}

      <section id="about">
        <h2 className="mb-1 text-lg font-bold">About you</h2>
        <p className="mb-3 text-sm text-muted">
          Helps hosts know who they&rsquo;re letting in. Only hosts of meetups you join or ask to join can
          see it.
        </p>
        <AboutForm initial={about} mode="settings" />
      </section>

      <section>
        <h2 className="mb-1 text-lg font-bold">Your interests</h2>
        <p className="mb-3 text-sm text-muted">We put meetups like these first in your feed.</p>
        <InterestsForm initial={interests} mode="settings" />
      </section>

      <section>
        <h2 className="mb-1 text-lg font-bold">Appearance</h2>
        <p className="mb-3 text-sm text-muted">Auto follows your phone&rsquo;s light or dark setting.</p>
        <ThemeToggle />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Notifications</h2>
        <div className="space-y-3">
          <EmailSettings initial={emailsOn} />
          <PushSettings />
        </div>
      </section>
    </div>
  );
}
