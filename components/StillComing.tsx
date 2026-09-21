"use client";

import { useState, useTransition } from "react";
import { confirmAttendance, setRsvp } from "@/app/actions";

/**
 * The day of a meetup: are you still coming? One tap either way. A confirmed guest is one the host
 * can count on; a freed spot goes to the next person waiting.
 */
export function StillComing({ eventId, startsAt, confirmed }: { eventId: string; startsAt: string; confirmed: boolean }) {
  const [state, setState] = useState<"ask" | "confirmed" | "freed">(confirmed ? "confirmed" : "ask");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function yes() {
    setError(undefined);
    startTransition(async () => {
      const result = await confirmAttendance(eventId);
      if (result.error) setError(result.error);
      else setState("confirmed");
    });
  }

  function free() {
    if (!window.confirm("Free your spot? Someone on the waitlist can take it, and you can rejoin later if there's room.")) return;
    setError(undefined);
    startTransition(async () => {
      const result = await setRsvp(eventId, false);
      if (result.error) setError(result.error);
      else setState("freed");
    });
  }

  if (state === "freed") {
    return (
      <p role="status" className="rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent-dark">
        <span className="font-semibold">Thanks for letting us know.</span> Your spot is free for someone else.
      </p>
    );
  }
  if (state === "confirmed") {
    return (
      <p role="status" className="rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent-dark">
        <span className="font-semibold">You&rsquo;re confirmed.</span> See you {startsAt}.
      </p>
    );
  }

  return (
    <section aria-labelledby="still-heading" className="card space-y-3 border-accent p-4">
      <div>
        <h2 id="still-heading" className="text-sm font-semibold">
          Still coming {startsAt}?
        </h2>
        <p className="text-xs text-muted">Hosts plan around who confirms. If your plans changed, freeing your spot lets someone else in.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={yes} disabled={pending} className="btn-primary btn !py-2 text-sm">
          {pending ? "…" : "Yes, I'm coming"}
        </button>
        <button type="button" onClick={free} disabled={pending} className="btn-secondary btn !py-2 text-sm">
          I can&rsquo;t make it
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}
