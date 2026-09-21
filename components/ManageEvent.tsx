"use client";

import { useState, useTransition } from "react";
import { cancelEvent } from "@/app/actions";

/** Host-only: cancel the meetup. (Date, place and spots are changed with the Edit button at the top.) */
export function ManageEvent({ eventId }: { eventId: string }) {
  const [message, setMessage] = useState<string>();
  const [pending, startTransition] = useTransition();

  function cancel() {
    if (
      !window.confirm(
        "Cancel this meetup? Everyone will see it was cancelled, and nobody else can join. This can't be undone."
      )
    )
      return;
    setMessage(undefined);
    startTransition(async () => {
      const result = await cancelEvent(eventId);
      if (result.error) setMessage(result.error);
    });
  }

  return (
    <section className="card space-y-3 p-4">
      <h2 className="text-sm font-semibold">Manage this meetup</h2>
      <p className="text-xs text-muted">
        To change the date, place or number of spots, use <span className="font-semibold">Edit</span> at the top of this page.
      </p>
      <div>
        <button
          onClick={cancel}
          disabled={pending}
          className="btn w-full border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:opacity-60"
        >
          Cancel this meetup
        </button>
        <p className="mt-1.5 text-xs text-muted">
          Keeps the page up with a cancelled notice and stops new joins. Everyone who joined gets an
          email and a push notification. Only SoFly can undo a cancellation.
        </p>
      </div>
      {message && <p className="text-sm text-red-600">{message}</p>}
    </section>
  );
}
