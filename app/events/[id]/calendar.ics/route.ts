import { buildIcs } from "@/lib/ics";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Download a meetup as a calendar file. Approval-only events include the real address, so
// they're only available to the host and approved guests (row level security decides).
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: event } = await supabase.from("events").select("*").eq("id", params.id).maybeSingle();
  if (!event) return new Response("Not found", { status: 404 });

  let location = `${event.venue_name}, ${event.address}`;
  if (event.join_mode === "request") {
    const { data: private_ } = await supabase
      .from("event_locations")
      .select("venue_name, address")
      .eq("event_id", event.id)
      .maybeSingle();
    // No row means the viewer isn't the host or an approved guest.
    if (!private_) return new Response("Not found", { status: 404 });
    location = `${private_.venue_name}, ${private_.address}`;
  }

  const origin = new URL(request.url).origin;
  const ics = buildIcs({
    id: event.id,
    title: event.title,
    start: new Date(event.starts_at),
    location,
    description: event.description,
    url: `${origin}/events/${event.id}`,
    cancelled: Boolean(event.cancelled_at),
  });

  const slug = event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "meetup";
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="baymeet-${slug}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
