"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { setRsvp } from "@/app/actions";

type Status = "pending" | "approved" | "declined" | null;

export function RsvpPanel({
  eventId,
  maxSpots,
  taken,
  myStatus,
  joinMode,
  loggedIn,
  ended,
  cancelled,
  blocked,
}: {
  eventId: string;
  maxSpots: number;
  /** Approved people only. */
  taken: number;
  myStatus: Status;
  joinMode: "open" | "request";
  loggedIn: boolean;
  ended: boolean;
  cancelled: boolean;
  /** Why a logged-in viewer can't join: profile incomplete, or outside the age range. */
  blocked: { kind: "profile" } | { kind: "age"; label: string } | null;
}) {
  const isRequest = joinMode === "request";
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [state, setOptimistic] = useOptimistic(
    { status: myStatus, taken },
    (current, action: "join" | "leave") => {
      if (action === "leave") {
        return { status: null as Status, taken: current.taken - (current.status === "approved" ? 1 : 0) };
      }
      const status: Status = isRequest ? "pending" : "approved";
      return { status, taken: current.taken + (status === "approved" ? 1 : 0) };
    }
  );

  const left = Math.max(maxSpots - state.taken, 0);
  const full = left === 0 && !state.status;

  function act(action: "join" | "leave") {
    setError(undefined);
    startTransition(async () => {
      setOptimistic(action);
      const result = await setRsvp(eventId, action === "join");
      if (result.error) setError(result.error);
    });
  }

  const disabled = (label: string) => (
    <button disabled className="btn-primary w-full">
      {label}
    </button>
  );

  let body: React.ReactNode;
  if (cancelled) body = disabled("Cancelled");
  else if (ended) body = disabled("Ended");
  else if (state.status === "approved") {
    body = (
      <button onClick={() => act("leave")} disabled={pending} className="btn-secondary w-full">
        Leave
      </button>
    );
  } else if (state.status === "pending") {
    body = (
      <div className="space-y-2">
        <p className="text-sm text-muted">
          Request sent. The host will look it over, and you&rsquo;ll see their answer here.
        </p>
        <button onClick={() => act("leave")} disabled={pending} className="btn-secondary w-full">
          Cancel request
        </button>
      </div>
    );
  } else if (state.status === "declined") body = disabled("Not approved this time");
  else if (full) body = disabled("Full");
  else if (!loggedIn) {
    body = (
      <Link href={`/login?next=/events/${eventId}`} className="btn-primary w-full">
        {isRequest ? "Request to join" : "Join"}
      </Link>
    );
  } else if (blocked) {
    body =
      blocked.kind === "profile" ? (
        <Link href={`/welcome?next=/events/${eventId}`} className="btn-primary w-full">
          Finish your profile to join
        </Link>
      ) : (
        disabled(`For ages ${blocked.label}`)
      );
  } else {
    body = (
      <button onClick={() => act("join")} disabled={pending} className="btn-primary w-full">
        {isRequest ? "Request to join" : "Join"}
      </button>
    );
  }

  return (
    <div className="card p-4">
      {!cancelled && (
        <p className="mb-3 text-sm font-medium">
          <span className="text-lg font-bold">{left}</span> of {maxSpots} spots left
          {isRequest && <span className="text-muted"> · host approves each person</span>}
        </p>
      )}
      {body}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
