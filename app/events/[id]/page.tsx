import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryBadge } from "@/components/CategoryBadge";
import { DeleteEventButton } from "@/components/DeleteEventButton";
import { EventActions } from "@/components/EventActions";
import { Avatar } from "@/components/Avatar";
import { EventTags } from "@/components/EventTags";
import { FeedbackPrompt } from "@/components/FeedbackPrompt";
import { HostCard } from "@/components/HostCard";
import { GroupChat } from "@/components/GroupChat";
import { GuestProfiles } from "@/components/GuestProfiles";
import { ManageEvent } from "@/components/ManageEvent";
import { ReportEvent } from "@/components/ReportEvent";
import { RequestsPanel } from "@/components/RequestsPanel";
import { RsvpPanel } from "@/components/RsvpPanel";
import { ShareButton } from "@/components/ShareButton";
import { hasAbout } from "@/lib/about";
import { ageLabel, ageOn, withinAgeRange } from "@/lib/age";
import { getAbout, getAboutFor, getBirthDate } from "@/lib/profile";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { formatWhenLong, pacificDate } from "@/lib/time";
import type { EventRow } from "@/lib/types";
import { firstName } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Status = "pending" | "approved" | "declined";

type Detail = EventRow & {
  host: { name: string; created_at: string } | null;
  // Row-level security decides which of these each viewer can see.
  rsvps: {
    user_id: string;
    created_at: string;
    status: Status;
    profiles: { name: string } | null;
  }[];
};

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const { data } = await createPublicClient()
    .from("events")
    .select("title, venue_name, neighborhood, starts_at, cancelled_at, join_mode")
    .eq("id", params.id)
    .maybeSingle();
  if (!data) return { title: "Meetup not found" };

  const when = formatWhenLong(data.starts_at);
  const cancelled = Boolean(data.cancelled_at);
  const description = cancelled
    ? "This meetup was cancelled."
    : data.join_mode === "request"
      ? `${when.day} · ${when.time} · ${data.neighborhood} · Request to join`
      : `${when.day} · ${when.time} · ${data.neighborhood}, ${data.venue_name}`;
  return {
    title: cancelled ? `Cancelled: ${data.title}` : data.title,
    description,
    openGraph: { title: data.title, description, type: "website" },
    twitter: { card: "summary_large_image", title: data.title, description },
  };
}

export default async function EventPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data }, userResult] = await Promise.all([
    supabase
      .from("events")
      .select("*, host:profiles!host_id(name, created_at), rsvps(user_id, created_at, status, profiles(name))")
      .eq("id", params.id)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  const event = data as Detail | null;
  if (!event) notFound();

  const user = userResult.data.user;
  const isHost = user?.id === event.host_id;
  const isRequest = event.join_mode === "request";
  const myStatus = event.rsvps.find((r) => r.user_id === user?.id)?.status ?? null;
  const going = myStatus === "approved";
  const insider = isHost || going;

  // RLS only returns these rows to the host and to approved guests.
  let chatUrl: string | null = null;
  let venue = event.venue_name;
  let address = event.address;
  let hasRealLocation = !isRequest;
  if (user && insider) {
    const [chat, location] = await Promise.all([
      supabase.from("event_chat_links").select("url").eq("event_id", event.id).maybeSingle(),
      isRequest
        ? supabase
            .from("event_locations")
            .select("venue_name, address")
            .eq("event_id", event.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    chatUrl = chat.data?.url ?? null;
    if (location.data) {
      venue = location.data.venue_name;
      address = location.data.address;
      hasRealLocation = true;
    }
  }

  // Intros written with join requests. RLS returns all of them to the host, and only
  // your own to you.
  const notes = new Map<string, string>();
  if (isRequest && user && (isHost || myStatus)) {
    const { data: noteRows } = await supabase
      .from("rsvp_notes")
      .select("user_id, note")
      .eq("event_id", event.id);
    for (const n of noteRows ?? []) notes.set(n.user_id as string, n.note as string);
  }

  // Can this viewer join? (Only matters once they're logged in.)
  let blocked: { kind: "profile" } | { kind: "age"; label: string } | null = null;
  if (user) {
    const birthDate = await getBirthDate(supabase, user.id);
    if (!birthDate) blocked = { kind: "profile" };
    else if (event.age_min != null || event.age_max != null) {
      const age = ageOn(birthDate, pacificDate(new Date(event.starts_at)));
      if (!withinAgeRange(age, event.age_min, event.age_max)) {
        blocked = { kind: "age", label: ageLabel(event.age_min, event.age_max) ?? "" };
      }
    }
  }

  const byJoinTime = (a: { created_at: string }, b: { created_at: string }) =>
    a.created_at.localeCompare(b.created_at);
  const attendees = event.rsvps.filter((r) => r.status === "approved").sort(byJoinTime);
  // A host sees the profiles of the people asking to join and of approved guests. (Row level
  // security returns only bios of people who have a request or RSVP on one of the host's meetups.)
  const guestBios = isHost
    ? await getAboutFor(
        supabase,
        event.rsvps.filter((r) => r.user_id !== event.host_id && r.status !== "declined").map((r) => r.user_id)
      )
    : {};
  const requests = isHost
    ? event.rsvps
        .filter((r) => r.status === "pending")
        .sort(byJoinTime)
        .map((r) => ({
          userId: r.user_id,
          name: r.profiles?.name?.trim() || "Someone",
          note: notes.get(r.user_id) ?? "",
          about: guestBios[r.user_id] ?? null,
        }))
    : [];

  // The host's track record: meetups that already happened, and how many people came.
  const { data: hostHistory } = await supabase
    .from("events")
    .select("spots_taken, feedback_yes, feedback_total")
    .eq("host_id", event.host_id)
    .is("cancelled_at", null)
    .lt("starts_at", new Date().toISOString());
  const hostedCount = hostHistory?.length ?? 0;
  const hostedJoined = (hostHistory ?? []).reduce((sum, e) => sum + (e.spots_taken as number), 0);
  const hostYes = (hostHistory ?? []).reduce((sum, e) => sum + (e.feedback_yes as number), 0);
  const hostAnswers = (hostHistory ?? []).reduce((sum, e) => sum + (e.feedback_total as number), 0);

  const guests = isHost
    ? attendees
        .filter((r) => r.user_id !== event.host_id)
        .map((r) => ({ userId: r.user_id, name: r.profiles?.name?.trim() || "Someone", about: guestBios[r.user_id] ?? null }))
    : [];
  // Whether the viewer has filled in "about you", which hosts see alongside a request.
  const viewerHasAbout = user && !isHost && isRequest ? hasAbout(await getAbout(supabase, user.id)) : true;

  const when = formatWhenLong(event.starts_at);
  const cancelled = Boolean(event.cancelled_at);
  const ended = new Date(event.starts_at).getTime() <= Date.now();

  // After the meetup, guests are asked whether they'd join again (their own answer is private).
  let myAnswer: boolean | null = null;
  const canRate = going && ended && !cancelled && !isHost;
  if (canRate) {
    const { data: answer } = await supabase
      .from("meetup_feedback")
      .select("would_join_again")
      .eq("event_id", event.id)
      .maybeSingle();
    myAnswer = (answer?.would_join_again as boolean | undefined) ?? null;
  }
  const spotsLeft = Math.max(event.max_spots - event.spots_taken, 0);
  const mapSrc = `https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;

  return (
    <article className="space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm font-medium text-muted hover:text-ink">
          ← All meetups
        </Link>
        <ShareButton
          title={event.title}
          text={`${event.title}: ${when.day} · ${when.time}, ${event.neighborhood}`}
        />
      </div>

      {cancelled && (
        <div role="status" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
          <p className="font-semibold">This meetup was cancelled.</p>
          <p className="text-sm">Please don&rsquo;t show up. It won&rsquo;t be happening.</p>
        </div>
      )}

      <header>
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={event.category} />
          <EventTags event={event} />
        </div>
        <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight">{event.title}</h1>
        <p className="mt-1 text-sm text-muted">Hosted by {event.host?.name || "someone"}</p>
      </header>

      <div className="card divide-y divide-line">
        <div className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">When</p>
          <p className="mt-0.5 font-semibold">{when.day}</p>
          <p className="text-muted">{when.time}</p>
        </div>
        <div className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Where</p>
          {hasRealLocation ? (
            <>
              <p className="mt-0.5 font-semibold">{venue}</p>
              <p className="text-muted">{address}</p>
              <p className="text-sm text-muted">{event.neighborhood}</p>
            </>
          ) : (
            <>
              <p className="mt-0.5 font-semibold">{event.neighborhood}</p>
              <p className="text-sm text-muted">
                The exact address is shared once the host approves you.
              </p>
            </>
          )}
        </div>
      </div>

      {!isHost && (
        <HostCard
          name={event.host?.name?.trim() || "Someone"}
          since={event.host?.created_at ?? null}
          hosted={hostedCount}
          joined={hostedJoined}
          feedbackYes={hostYes}
          feedbackTotal={hostAnswers}
        />
      )}

      {canRate && <FeedbackPrompt eventId={event.id} title={event.title} initial={myAnswer} />}

      <RsvpPanel
        eventId={event.id}
        maxSpots={event.max_spots}
        taken={event.spots_taken}
        myStatus={myStatus}
        joinMode={event.join_mode}
        loggedIn={Boolean(user)}
        ended={ended}
        cancelled={cancelled}
        blocked={blocked}
        isHost={isHost}
        hostName={event.host?.name?.trim() || "the host"}
        myNote={(user && notes.get(user.id)) || null}
        hasAbout={viewerHasAbout}
      />

      {insider && !cancelled && !ended && (
        <EventActions eventId={event.id} address={hasRealLocation ? address : null} />
      )}

      {isHost && isRequest && !cancelled && (
        <RequestsPanel eventId={event.id} requests={requests} spotsLeft={spotsLeft} />
      )}

      {isHost && !cancelled && <GuestProfiles guests={guests} />}

      {!cancelled && (isHost || (going && chatUrl)) && (
        <GroupChat eventId={event.id} url={chatUrl} isHost={isHost} />
      )}

      {event.description && (
        <section>
          <h2 className="mb-1.5 text-sm font-semibold">About</h2>
          <p className="whitespace-pre-line text-ink/90">{event.description}</p>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold">Who&rsquo;s going ({event.spots_taken})</h2>
        {isRequest && !insider ? (
          <p className="text-sm text-muted">Names are shared with approved guests.</p>
        ) : attendees.length === 0 ? (
          <p className="text-sm text-muted">
            {isRequest ? "Nobody approved yet." : "Nobody yet. Be the first to join."}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {attendees.map((r) => (
              <li
                key={r.user_id}
                className="flex items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-3 text-sm"
              >
                <Avatar name={r.profiles?.name ?? ""} size="sm" />
                {firstName(r.profiles?.name)}
              </li>
            ))}
          </ul>
        )}
      </section>

      {hasRealLocation && (
        <div className="card overflow-hidden">
          <iframe
            title={`Map of ${venue}`}
            src={mapSrc}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="h-64 w-full border-0"
          />
        </div>
      )}

      {isHost && !cancelled && (
        <ManageEvent eventId={event.id} maxSpots={event.max_spots} spotsTaken={event.spots_taken} />
      )}

      {isHost ? (
        <DeleteEventButton
          eventId={event.id}
          // Who would be told it's off: approved guests, if it hasn't been cancelled or started yet.
          toNotify={cancelled || ended ? 0 : attendees.filter((r) => r.user_id !== event.host_id).length}
          canCancelInstead={!cancelled && !ended}
        />
      ) : cancelled ? null : (
        <ReportEvent eventId={event.id} loggedIn={Boolean(user)} />
      )}
    </article>
  );
}
