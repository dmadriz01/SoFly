"use client";

import { useState, useTransition } from "react";
import { deleteEvent } from "@/app/actions";

/**
 * Deleting removes the meetup completely (page, guest list, everything). Cancelling instead keeps
 * the page up with a "cancelled" notice. Either way the people who were going are emailed and pushed.
 */
export function DeleteEventButton({
  eventId,
  toNotify,
  canCancelInstead,
}: {
  eventId: string;
  /** How many people will be told it's off. */
  toNotify: number;
  /** Cancelling is still possible (it hasn't started or been cancelled). */
  canCancelInstead: boolean;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function onClick() {
    const told =
      toNotify > 0
        ? ` The ${toNotify === 1 ? "1 person" : `${toNotify} people`} who joined will be told it was cancelled.`
        : "";
    if (!window.confirm(`Delete this meetup? It disappears completely, for everyone. This can't be undone.${told}`)) return;
    setError(undefined);
    startTransition(async () => {
      // On success the action redirects to the feed.
      const result = await deleteEvent(eventId);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div>
      <button
        onClick={onClick}
        disabled={pending}
        className="btn w-full border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Delete this meetup"}
      </button>
      <p className="mt-1.5 text-xs text-muted">
        Removes the page and guest list for good.
        {toNotify > 0 && " People who joined get an email and a push notification."}
        {canCancelInstead && " To keep the page up with a cancelled notice, use Cancel above instead."}
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
