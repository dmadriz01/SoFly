"use client";

import { useState, useTransition } from "react";
import { respondToRequest } from "@/app/actions";
import type { About } from "@/lib/about";
import { BioBlock } from "./BioBlock";

export type PendingRequest = { userId: string; name: string; note: string; about: About | null; invitedBy?: string };

/** The host's inbox for a request-to-join event. */
export function RequestsPanel({
  eventId,
  requests,
  spotsLeft,
}: {
  eventId: string;
  requests: PendingRequest[];
  spotsLeft: number;
}) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [pending, startTransition] = useTransition();

  function respond(userId: string, decision: "approve" | "decline") {
    setError(undefined);
    setBusy(userId);
    startTransition(async () => {
      const result = await respondToRequest(eventId, userId, decision);
      if (result.error) setError(result.error);
      setBusy(undefined);
    });
  }

  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Requests {requests.length > 0 && <span className="text-accent-dark">({requests.length})</span>}
        </h2>
        <p className="text-xs text-muted">{spotsLeft} spots left</p>
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-muted">
          No pending requests. When someone asks to join, you&rsquo;ll see them here and on the Me tab.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {requests.map((r) => (
            <li key={r.userId} className="space-y-2 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 font-medium">
                  <span className="block truncate">{r.name}</span>
                  {r.invitedBy && <span className="mt-0.5 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-dark">Invited by {r.invitedBy}</span>}
                </span>
                <span className="flex shrink-0 gap-2">
                <button
                  onClick={() => respond(r.userId, "decline")}
                  disabled={pending}
                  className="btn-secondary tap !px-3.5 !py-1.5 text-sm"
                >
                  Decline
                </button>
                <button
                  onClick={() => respond(r.userId, "approve")}
                  disabled={pending || spotsLeft <= 0}
                  className="btn-primary tap !px-3.5 !py-1.5 text-sm"
                >
                  {busy === r.userId ? "…" : "Approve"}
                </button>
                </span>
              </div>
              <div className="space-y-2 rounded-xl bg-cream px-3 py-2.5">
                <BioBlock about={r.about} />
                {r.note && (
                  <p className="whitespace-pre-line border-t border-line pt-2 text-sm text-ink/90">
                    <span className="mb-0.5 block text-xs font-semibold uppercase tracking-wide text-muted">Note</span>
                    {r.note}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {spotsLeft <= 0 && requests.length > 0 && (
        <p className="text-xs text-muted">You&rsquo;re out of spots, so approving is turned off.</p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <p className="text-xs text-muted">
        Approved people can see the exact address and the group chat link.
      </p>
    </section>
  );
}
