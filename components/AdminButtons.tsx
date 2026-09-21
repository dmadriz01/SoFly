"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adminCancelEvent, adminReinstateEvent, adminSetReportReviewed } from "@/app/admin/actions";

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const run = (work: () => Promise<{ error?: string }>) => {
    setError(undefined);
    startTransition(async () => {
      const result = await work();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  };
  return { pending, error, run };
}

/** Cancel a live meetup (guests are told) or reinstate a cancelled one. */
export function ModerateEvent({ eventId, title, cancelled }: { eventId: string; title: string; cancelled: boolean }) {
  const { pending, error, run } = useRun();
  const click = () => {
    const ok = cancelled
      ? window.confirm(`Reinstate "${title}"? It goes back on the feed. People who were told it was cancelled won't be told again.`)
      : window.confirm(`Cancel "${title}"? It's marked cancelled for everyone and joining closes. The people who joined get an email and a push notification, and its reports are closed.`);
    if (ok) run(() => (cancelled ? adminReinstateEvent(eventId) : adminCancelEvent(eventId)));
  };
  return (
    <span className="inline-flex flex-col">
      <button
        onClick={click}
        disabled={pending}
        className={`btn !px-3.5 !py-2 text-sm disabled:opacity-60 ${
          cancelled ? "border border-line bg-white text-ink hover:border-accent/50" : "border border-red-200 bg-white text-red-700 hover:bg-red-50"
        }`}
      >
        {pending ? "Working…" : cancelled ? "Reinstate" : "Cancel meetup"}
      </button>
      {error && <span role="alert" className="mt-1 text-xs text-red-600">{error}</span>}
    </span>
  );
}

/** Mark a report as dealt with, or reopen it. */
export function ReviewReport({ reportId, reviewed }: { reportId: string; reviewed: boolean }) {
  const { pending, error, run } = useRun();
  return (
    <span className="inline-flex flex-col">
      <button
        onClick={() => run(() => adminSetReportReviewed(reportId, !reviewed))}
        disabled={pending}
        className="btn-secondary btn !px-3.5 !py-2 text-sm disabled:opacity-60"
      >
        {pending ? "Working…" : reviewed ? "Reopen" : "Mark reviewed"}
      </button>
      {error && <span role="alert" className="mt-1 text-xs text-red-600">{error}</span>}
    </span>
  );
}
