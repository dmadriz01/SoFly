import { redirect } from "next/navigation";
import { EventForm } from "@/components/EventForm";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/events/new");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Post a meetup</h1>
        <p className="mt-1 text-muted">Tell people where to show up.</p>
      </div>
      <EventForm />
    </div>
  );
}
