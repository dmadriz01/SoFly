import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminTabs, MeetupsTab, OverviewTab, ReportsTab, type Tab } from "@/components/AdminView";
import { getAdminUser } from "@/lib/admin";
import { countOpenReports, EVENT_FILTERS, EVENT_PAGE, loadEvents, loadReports, loadStats, type EventFilter } from "@/lib/admin-data";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

// Query values can arrive as arrays (?q=a&q=b) or be missing, so read each as plain text first.
type Params = Record<string, string | string[] | undefined>;
const text = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

const pick = <T extends string>(value: string | string[] | undefined, allowed: readonly T[], fallback: T): T =>
  allowed.includes(text(value) as T) ? (text(value) as T) : fallback;

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card space-y-2 p-4 text-sm">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </div>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Params }) {
  // Everything below is only for admins. Anyone else sees an ordinary "not found" page.
  if (!(await getAdminUser())) notFound();

  const admin = createAdminClient();
  const tab = pick(searchParams.tab, ["overview", "reports", "meetups"] as const, "overview") as Tab;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <Link href="/" className="tap text-sm text-muted hover:text-ink">Back to BayMeet</Link>
      </div>
      {!admin ? (
        <Notice title="One more setting needed">
          <p>
            The admin page reads everything with BayMeet&rsquo;s server key, and <code>SUPABASE_SERVICE_ROLE_KEY</code> isn&rsquo;t set
            here. Add it (Supabase &rarr; Project Settings &rarr; API) and redeploy. It&rsquo;s the same key that powers the emails.
          </p>
        </Notice>
      ) : (
        <AdminBody admin={admin} tab={tab} params={searchParams} />
      )}
    </div>
  );
}

async function AdminBody({ admin, tab, params }: { admin: NonNullable<ReturnType<typeof createAdminClient>>; tab: Tab; params: Params }) {
  try {
    const openReports = await countOpenReports(admin);
    let body: React.ReactNode;
    if (tab === "reports") {
      const showReviewed = text(params.show) === "all";
      body = <ReportsTab reports={await loadReports(admin, { showReviewed })} showReviewed={showReviewed} />;
    } else if (tab === "meetups") {
      const filter: EventFilter = pick(params.filter, EVENT_FILTERS, "upcoming");
      const q = text(params.q).trim().slice(0, 60);
      const n = Number.parseInt(text(params.n), 10);
      const limit = Number.isFinite(n) ? Math.min(Math.max(n, EVENT_PAGE), 300) : EVENT_PAGE;
      body = <MeetupsTab events={await loadEvents(admin, { filter, q, limit })} filter={filter} q={q} limit={limit} />;
    } else {
      body = <OverviewTab stats={await loadStats(admin)} />;
    }
    return (
      <>
        <AdminTabs tab={tab} openReports={openReports} />
        {body}
      </>
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Admin page failed to load:", message);
    return (
      <Notice title="The admin page couldn't load its data">
        {/reviewed_at/.test(message) ? (
          <p>
            The database is missing the newest update. Run <code>015_admin_review.sql</code> from <code>supabase/migrations</code> in the
            Supabase SQL editor, then reload.
          </p>
        ) : (
          <p>Something went wrong reading the database. The details are in the server logs. Try again in a moment.</p>
        )}
      </Notice>
    );
  }
}
