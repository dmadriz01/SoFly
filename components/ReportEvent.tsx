"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { reportEvent } from "@/app/actions";
import { REPORT_REASONS } from "@/lib/constants";

export function ReportEvent({ eventId, loggedIn }: { eventId: string; loggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (done) {
    return <p className="text-sm text-muted">Thanks. We&rsquo;ll take a look at this meetup.</p>;
  }

  if (!loggedIn) {
    return (
      <p className="text-sm text-muted">
        <Link
          href={`/login?next=/events/${eventId}`}
          className="underline hover:text-ink"
        >
          Log in
        </Link>{" "}
        to report this meetup.
      </p>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-muted underline hover:text-ink">
        Report this meetup
      </button>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) {
      setError("Pick a reason.");
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await reportEvent(eventId, reason, details);
      if (result.error) setError(result.error);
      else setDone(true);
    });
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <p className="text-sm font-semibold">Report this meetup</p>
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="field text-sm"
        aria-label="Reason"
      >
        <option value="" disabled>
          Select a reason…
        </option>
        {REPORT_REASONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="Anything else we should know? (optional)"
        className="field text-sm"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-primary !py-2 text-sm">
          {pending ? "Sending…" : "Send report"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn-secondary !py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
