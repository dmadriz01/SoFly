"use client";

import { useState, useTransition } from "react";
import { cancelSeries } from "@/app/actions";

/** Host-only: cancel this meetup and every later date in its series. */
export function CancelSeriesButton({ eventId, count }: { eventId: string; count: number }) {
  const [message, setMessage] = useState<string>();
  const [pending, startTransition] = useTransition();

  function run() {
    const ok = window.confirm(
      `Cancel this and the ${count - 1 === 1 ? "1 later meetup" : `${count - 1} later meetups`} in this series? Everyone who joined any of them gets an email and a push notification. This can't be undone.`
    );
    if (!ok) return;
    setMessage(undefined);
    startTransition(async () => {
      const result = await cancelSeries(eventId);
      if (result.error) setMessage(result.error);
    });
  }

  return (
    <div>
      <button
        onClick={run}
        disabled={pending}
        className="btn w-full border border-danger-line bg-surface text-danger hover:bg-danger-soft disabled:opacity-60"
      >
        {pending ? "Cancelling…" : `Cancel this and all ${count} remaining`}
      </button>
      {message && <p className="mt-1.5 text-sm text-danger">{message}</p>}
    </div>
  );
}
