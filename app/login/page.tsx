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
  if (user) redirect(`/welcome?next=${encodeURIComponent(next)}`);

  return (
    <div className="mx-auto max-w-sm space-y-6 pt-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Access SoFly</h1>
        <p className="mt-1 text-muted">
          No password needed for your account. We&rsquo;ll email you a code to log in.
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
