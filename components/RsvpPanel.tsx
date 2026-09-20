"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { setRsvp } from "@/app/actions";

export function RsvpPanel({
  eventId,
  maxSpots,
  taken,
  going,
  loggedIn,
  ended,
  cancelled,
  blocked,
}: {
  eventId: string;
  maxSpots: number;
  taken: number;
  going: boolean;
  loggedIn: boolean;
  ended: boolean;
  cancelled: boolean;
  /** Why a logged-in viewer can't join: profile incomplete, or outside the age range. */
  blocked: { kind: "profile" } | { kind: "age"; label: string } | null;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [state, setOptimistic] = useOptimistic(
    { going, taken },
    (current, join: boolean) => ({
      going: join,
      taken: current.taken + (join === current.going ? 0 : join ? 1 : -1),
    })
  );

  const left = Math.max(maxSpots - state.taken, 0);
  const full = left === 0 && !state.going;

  function toggle() {
    setError(undefined);
    const join = !state.going;
    startTransition(async () => {
      setOptimistic(join);
      const result = await setRsvp(eventId, join);
      if (result.error) setError(result.error);
    });
  }

  let button: React.ReactNode;
  if (cancelled) {
    button = (
      <button disabled className="btn-primary w-full">
        Cancelled
      </button>
    );
  } else if (ended) {
    button = (
      <button disabled className="btn-primary w-full">
        Ended
      </button>
    );
  } else if (full) {
    button = (
      <button disabled className="btn-primary w-full">
        Full
      </button>
    );
  } else if (!loggedIn) {
    button = (
      <Link href={`/login?next=/events/${eventId}`} className="btn-primary w-full">
        Join
      </Link>
    );
  } else if (blocked && !state.going) {
    button =
      blocked.kind === "profile" ? (
        <Link href={`/welcome?next=/events/${eventId}`} className="btn-primary w-full">
          Finish your profile to join
        </Link>
      ) : (
        <button disabled className="btn-primary w-full">
          For ages {blocked.label}
        </button>
      );
  } else {
    button = (
      <button
        onClick={toggle}
        disabled={pending}
        className={state.going ? "btn-secondary w-full" : "btn-primary w-full"}
      >
        {state.going ? "Leave" : "Join"}
      </button>
    );
  }

  return (
    <div className="card p-4">
      {!cancelled && (
        <p className="mb-3 text-sm font-medium">
          <span className="text-lg font-bold">{left}</span> of {maxSpots} spots left
        </p>
      )}
      {button}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
