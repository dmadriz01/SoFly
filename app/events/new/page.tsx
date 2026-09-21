import { redirect } from "next/navigation";
import { EventForm, type EventFormInitial } from "@/components/EventForm";
import { getBirthDate } from "@/lib/profile";
import { CITIES } from "@/lib/cities";
import { currentCity } from "@/lib/city-pref";
import { isRepeatEvery, suggestNextStart } from "@/lib/recurrence";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function NewEventPage({ searchParams }: { searchParams: { from?: string | string[]; repeat?: string | string[] } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/events/new");
  if (!(await getBirthDate(supabase, user.id))) redirect("/welcome?next=/events/new");

  // "Post again": start from one of your own meetups (only yours), with the date moved forward.
  let initial: EventFormInitial | undefined;
  let copiedFrom: string | undefined;
  const from = one(searchParams.from);
  if (UUID.test(from)) {
    const { data: e } = await supabase
      .from("events")
      .select("host_id, title, category, description, venue_name, address, neighborhood, starts_at, max_spots, join_mode, skill_level, audience, age_min, age_max")
      .eq("id", from)
      .maybeSingle();
    if (e && e.host_id === user.id) {
      let venue = e.venue_name as string;
      let address = e.address as string;
      if (e.join_mode === "request") {
        // The real place of an approval-only meetup is private; you can read it because you're the host.
        const { data: location } = await supabase.from("event_locations").select("venue_name, address").eq("event_id", from).maybeSingle();
        venue = (location?.venue_name as string | undefined) ?? "";
        address = (location?.address as string | undefined) ?? "";
      }
      // The city and the name of an "Other ..." activity. Best effort: a database from before cities just has neither.
      const { data: extra } = await supabase.from("events").select("city, activity").eq("id", from).maybeSingle();
      const { data: chat } = await supabase.from("event_chat_links").select("url").eq("event_id", from).maybeSingle();
      const repeatDays = Number(one(searchParams.repeat));
      copiedFrom = e.title as string;
      initial = {
        title: e.title as string,
        category: e.category as string,
        activity: (extra?.activity as string | null | undefined) ?? "",
        city: (extra?.city as string | undefined) ?? "",
        description: (e.description as string) ?? "",
        venue_name: venue,
        address,
        neighborhood: e.neighborhood as string,
        starts_at: suggestNextStart(e.starts_at as string, isRepeatEvery(repeatDays) ? repeatDays : 7) ?? "",
        max_spots: String(e.max_spots),
        join_mode: e.join_mode as string,
        skill_level: e.skill_level as string,
        audience: e.audience as string,
        age_min: e.age_min == null ? "" : String(e.age_min),
        age_max: e.age_max == null ? "" : String(e.age_max),
        chat_url: (chat?.url as string | undefined) ?? "",
        repeat_every: isRepeatEvery(repeatDays) ? String(repeatDays) : "",
        repeat_count: "4",
      };
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{copiedFrom ? "Post again" : "Post a meetup"}</h1>
        <p className="mt-1 text-muted">
          {copiedFrom ? <>Copied from &ldquo;{copiedFrom}&rdquo;. Change anything you like, and pick the new date.</> : "Tell people where to show up."}
        </p>
      </div>
      <EventForm initial={initial} cities={CITIES} defaultCity={await currentCity(supabase, user.id)} />
    </div>
  );
}
