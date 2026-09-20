import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/OnboardingForm";
import { getBirthDate } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Every login passes through here. Anyone who has already finished their profile is
// forwarded straight on, so returning users never see this page.
export default async function WelcomePage({ searchParams }: { searchParams: { next?: string } }) {
  const next = safeNext(searchParams.next);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);

  if (await getBirthDate(supabase, user.id)) redirect(next);

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-sm space-y-6 pt-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome to BayMeet</h1>
        <p className="mt-1 text-muted">
          Two quick things before you join in. Some meetups have age requirements, so we need your
          birthday.
        </p>
      </div>
      <OnboardingForm defaultName={profile?.name ?? ""} next={next} />
    </div>
  );
}
