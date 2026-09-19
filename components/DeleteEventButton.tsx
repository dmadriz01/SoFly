"use client";

import { useState, useTransition } from "react";
import { deleteEvent } from "@/app/actions";

export function DeleteEventButton({ eventId }: { eventId: string }) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!window.confirm("Delete this meetup? This can't be undone.")) return;
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
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
