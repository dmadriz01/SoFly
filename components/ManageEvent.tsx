"use client";

import { useState, useTransition } from "react";
import { cancelEvent } from "@/app/actions";

/** Host-only: cancel the meetup. (Date, place and spots are changed with the Edit button at the top.) */
export function ManageEvent({ eventId, waiting = 0 }: { eventId: string; waiting?: number }) {
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
      {waiting > 0 && (
        <p role="note" className="rounded-xl bg-accent-soft px-3 py-2 text-xs text-accent-dark">
          <span className="font-semibold">
            {waiting} {waiting === 1 ? "person is" : "people are"} waiting for a spot.
          </span>{" "}
          Adding spots with <span className="font-semibold">Edit</span> tells them right away.
        </p>
      )}
      <p className="text-xs text-muted">
        To change the date, place or number of spots, use <span className="font-semibold">Edit</span> at the top of this page.
      </p>
      <div>
        <button
          onClick={cancel}
          disabled={pending}
          className="btn w-full border border-danger-line bg-surface text-danger-strong hover:bg-danger-soft disabled:opacity-60"
        >
          Cancel this meetup
        </button>
        <p className="mt-1.5 text-xs text-muted">
          Keeps the page up with a cancelled notice and stops new joins. Everyone who joined gets an
          email and a push notification. Only SoFly can undo a cancellation.
        </p>
      </div>
      {message && <p className="text-sm text-danger">{message}</p>}
    </section>
  );
}
