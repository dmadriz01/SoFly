import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const next = safeNext(searchParams.next);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(next);

  return (
    <div className="mx-auto max-w-sm space-y-6 pt-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Log in to BayMeet</h1>
        <p className="mt-1 text-muted">
          No password needed. We&rsquo;ll email you a link that logs you in.
        </p>
      </div>
      <LoginForm
        next={next}
        initialError={
          searchParams.error
            ? "That link didn't work or has expired. Request a new one below."
            : undefined
        }
      />
    </div>
  );
}
