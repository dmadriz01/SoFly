"use client";

import { useState, useTransition } from "react";
import { setEmailNotifications } from "@/app/actions";

/** One switch for all of BayMeet's emails. Login codes are always sent. */
export function EmailSettings({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next); // optimistic
    setError(undefined);
    startTransition(async () => {
      const result = await setEmailNotifications(next);
      if (result.error) {
        setOn(!next);
        setError(result.error);
      }
    });
  }

  return (
    <div className="card flex items-center justify-between gap-4 p-4">
      <div>
        <p className="font-semibold">Email me about my meetups</p>
        <p className="text-sm text-muted">
          Join requests and answers, cancellations, and a reminder the day before. Login codes always
          come through.
        </p>
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label="Email notifications"
        onClick={toggle}
        disabled={pending}
        className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition ${
          on ? "bg-accent" : "bg-line"
        }`}
      >
        <span
          className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-7" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
