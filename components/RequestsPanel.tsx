"use client";

import { useState, useTransition } from "react";
import { respondToRequest } from "@/app/actions";

export type PendingRequest = { userId: string; name: string };

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
            <li key={r.userId} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0 truncate font-medium">{r.name}</span>
              <span className="flex shrink-0 gap-2">
                <button
                  onClick={() => respond(r.userId, "decline")}
                  disabled={pending}
                  className="btn-secondary !px-3.5 !py-1.5 text-sm"
                >
                  Decline
                </button>
                <button
                  onClick={() => respond(r.userId, "approve")}
                  disabled={pending || spotsLeft <= 0}
                  className="btn-primary !px-3.5 !py-1.5 text-sm"
                >
                  {busy === r.userId ? "…" : "Approve"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {spotsLeft <= 0 && requests.length > 0 && (
        <p className="text-xs text-muted">You&rsquo;re out of spots, so approving is turned off.</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-muted">
        Approved people can see the exact address and the group chat link.
      </p>
    </section>
  );
}
