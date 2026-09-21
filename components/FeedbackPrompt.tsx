"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { getSimilarMeetups, submitFeedback } from "@/app/actions";

/** After a meetup: one tap for "would you join again?". Private; only totals are ever shown. */
export function FeedbackPrompt({
  eventId,
  title,
  initial,
  met,
}: {
  eventId: string;
  title: string;
  initial: boolean | null;
  /** How many other people were there, for a warm recap. */
  met?: number;
}) {
  const [similar, setSimilar] = useState<Awaited<ReturnType<typeof getSimilarMeetups>>["items"] | null>(null);
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
        return;
      }
      // Right after answering, while the good feeling is fresh: a few similar meetups coming up.
      if (similar === null) {
        try {
          setSimilar((await getSimilarMeetups(eventId)).items);
        } catch {
          setSimilar([]);
        }
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
        {met !== undefined && met > 0 && (
          <p className="text-sm font-medium text-accent-dark">
            You spent it with {met} {met === 1 ? "other person" : "other people"}.
          </p>
        )}
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
      {similar && similar.length > 0 && (
        <div className="space-y-2 border-t border-line pt-3">
          <h3 className="text-sm font-semibold">Keep it going</h3>
          <ul className="divide-y divide-line">
            {similar.map((m) => (
              <li key={m.id}>
                <Link href={`/events/${m.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-accent">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{m.title}</span>
                    <span className="block text-xs text-muted">
                      {m.when} · {m.place} · {m.why}
                    </span>
                  </span>
                  <span aria-hidden className="text-muted">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
