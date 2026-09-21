"use client";

import { useState, useTransition } from "react";
import { cancelEvent, updateMaxSpots } from "@/app/actions";

/** Host-only controls: change the number of spots, or cancel the meetup. */
export function ManageEvent({
  eventId,
  maxSpots,
  spotsTaken,
}: {
  eventId: string;
  maxSpots: number;
  spotsTaken: number;
}) {
  const [value, setValue] = useState(String(maxSpots));
  const [message, setMessage] = useState<{ text: string; ok: boolean }>();
  const [pending, startTransition] = useTransition();

  const parsed = Number(value);
  const changed = value.trim() !== "" && parsed !== maxSpots;

  function saveSpots(e: React.FormEvent) {
    e.preventDefault();
    setMessage(undefined);
    startTransition(async () => {
      const result = await updateMaxSpots(eventId, parsed);
      setMessage(result.error ? { text: result.error, ok: false } : { text: "Saved.", ok: true });
    });
  }

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
      if (result.error) setMessage({ text: result.error, ok: false });
    });
  }

  return (
    <section className="card space-y-4 p-4">
      <h2 className="text-sm font-semibold">Manage this meetup</h2>

      <form onSubmit={saveSpots} className="space-y-1.5">
        <label htmlFor="max-spots" className="block text-sm font-medium">
          Max spots
        </label>
        <div className="flex gap-2">
          <input
            id="max-spots"
            type="number"
            inputMode="numeric"
            min={Math.max(spotsTaken, 1)}
            max={200}
            step={1}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setMessage(undefined);
            }}
            className="field !w-28"
          />
          <button type="submit" disabled={pending || !changed} className="btn-secondary !py-2 text-sm">
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
        <p className="text-xs text-muted">
          {spotsTaken} {spotsTaken === 1 ? "person is" : "people are"} going, so you can&rsquo;t go below that.
        </p>
      </form>

      <div className="border-t border-line pt-4">
        <button
          onClick={cancel}
          disabled={pending}
          className="btn w-full border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:opacity-60"
        >
          Cancel this meetup
        </button>
        <p className="mt-1.5 text-xs text-muted">
          Keeps the page up with a cancelled notice and stops new joins. Everyone who joined gets an
          email and a push notification. Only BayMeet can undo a cancellation.
        </p>
      </div>

      {message && (
        <p className={`text-sm ${message.ok ? "text-muted" : "text-red-600"}`}>{message.text}</p>
      )}
    </section>
  );
}
