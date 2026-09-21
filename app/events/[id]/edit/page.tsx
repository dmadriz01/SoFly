import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EditEventForm } from "@/components/EditEventForm";
import { createClient } from "@/lib/supabase/server";
import { pacificLocalValue } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit meetup", robots: { index: false, follow: false } };

function Message({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-muted">{children}</p>
      <Link href={`/events/${id}`} className="btn-secondary">
        Back to the meetup
      </Link>
    </div>
  );
}

export default async function EditEventPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/events/${params.id}/edit`);

  const { data: event } = await supabase
    .from("events")
    .select("id, title, host_id, join_mode, starts_at, neighborhood, venue_name, address, max_spots, spots_taken, cancelled_at")
    .eq("id", params.id)
    .maybeSingle();
  if (!event) notFound();
  // Only the host edits. Anyone else goes back to the meetup rather than seeing an edit form.
  if (event.host_id !== user.id) redirect(`/events/${params.id}`);

  if (event.cancelled_at) {
    return (
      <Message id={event.id} title="This meetup was cancelled">
        A cancelled meetup can&rsquo;t be changed.
      </Message>
    );
  }
  if (new Date(event.starts_at).getTime() <= Date.now()) {
    return (
      <Message id={event.id} title="This meetup already started">
        Once a meetup has started, its date and place can&rsquo;t be changed.
      </Message>
    );
  }

  // For approval-only meetups the real place is the private location (only the host can read it).
  const isRequest = event.join_mode === "request";
  let venue = event.venue_name as string;
  let address = event.address as string;
  if (isRequest) {
    const { data: location } = await supabase.from("event_locations").select("venue_name, address").eq("event_id", event.id).maybeSingle();
    venue = (location?.venue_name as string | undefined) ?? "";
    address = (location?.address as string | undefined) ?? "";
  }

  const { count } = await supabase
    .from("rsvps")
    .select("user_id", { count: "exact", head: true })
    .eq("event_id", event.id)
    .eq("status", "approved")
    .neq("user_id", event.host_id);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/events/${event.id}`} className="text-sm font-medium text-muted hover:text-ink">
          ← Back to the meetup
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">Edit meetup</h1>
        <p className="mt-1 text-muted">{event.title}</p>
      </div>
      <EditEventForm
        eventId={event.id}
        isRequest={isRequest}
        toNotify={count ?? 0}
        spotsTaken={event.spots_taken}
        initial={{ starts_at: pacificLocalValue(event.starts_at), neighborhood: event.neighborhood, venue_name: venue, address, max_spots: event.max_spots }}
      />
    </div>
  );
}
