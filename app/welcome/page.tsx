import { redirect } from "next/navigation";
import { AboutForm } from "@/components/AboutForm";
import { InterestsForm } from "@/components/InterestsForm";
import { OnboardingForm } from "@/components/OnboardingForm";
import { getInterests } from "@/lib/interests";
import { getAbout } from "@/lib/profile";
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

  if (await getBirthDate(supabase, user.id)) {
    // Step 2: interests. Skipping still records an (empty) answer, so this is only asked once.
    const interests = await getInterests(supabase, user.id);
    if (interests !== null) {
      // Step 3: a short bio, so hosts know who they're letting in. Skipping still records an answer.
      if ((await getAbout(supabase, user.id)) !== null) redirect(next);
      return (
        <div className="mx-auto max-w-md space-y-6 pt-4">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-accent-dark">Step 3 of 3</p>
            <h1 className="text-2xl font-bold tracking-tight">Tell hosts who you are</h1>
            <p className="mt-1 text-muted">
              A short bio and, if you like, your LinkedIn or other profiles. Hosts see it when you ask to
              join their meetups. You can skip this and add it later from the Me tab.
            </p>
          </div>
          <AboutForm initial={null} next={next} mode="onboarding" />
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-md space-y-6 pt-4">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-accent-dark">Step 2 of 3</p>
          <h1 className="text-2xl font-bold tracking-tight">What are you into?</h1>
          <p className="mt-1 text-muted">
            Pick a few and we&rsquo;ll put meetups you&rsquo;ll like first. You can change these any
            time from the Me tab.
          </p>
        </div>
        <InterestsForm initial={[]} next={next} mode="onboarding" />
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-sm space-y-6 pt-4">
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-accent-dark">Step 1 of 3</p>
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
