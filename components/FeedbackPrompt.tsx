"use client";

import { useState, useTransition } from "react";
import { submitFeedback } from "@/app/actions";

/** After a meetup: one tap for "would you join again?". Private; only totals are ever shown. */
export function FeedbackPrompt({
  eventId,
  title,
  initial,
}: {
  eventId: string;
  title: string;
  initial: boolean | null;
}) {
  const [answer, setAnswer] = useState<boolean | null>(initial);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function choose(value: boolean) {
    const previous = answer;
    setAnswer(value); // optimistic
    setError(undefined);
    startTransition(async () => {
      const result = await submitFeedback(eventId, value);
      if (result.error) {
        setAnswer(previous);
        setError(result.error);
      }
    });
  }

  const option = (value: boolean, label: string) => (
    <button
      type="button"
      onClick={() => choose(value)}
      disabled={pending}
      aria-pressed={answer === value}
      className={`tap flex-1 rounded-xl border px-4 text-base font-semibold transition active:scale-[0.98] ${
        answer === value
          ? "border-accent bg-accent text-on-accent"
          : "border-line bg-surface text-ink hover:border-accent/50"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="card space-y-3 p-4">
      <div>
        <h2 className="font-semibold">How was {title}?</h2>
        <p className="text-sm text-muted">
          Would you join a meetup like this again? Only the total is shown, never who said what.
        </p>
      </div>
      <div className="flex gap-2">
        {option(true, "👍 Yes")}
        {option(false, "👎 Not really")}
      </div>
      {answer !== null && !error && (
        <p className="text-sm text-muted">Thanks! You can change your answer any time.</p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}
