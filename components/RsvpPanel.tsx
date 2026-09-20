"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { setRsvp } from "@/app/actions";
import { NOTE_MAX, validateRequestNote } from "@/lib/validation";

type Status = "pending" | "approved" | "declined" | null;

export function RsvpPanel({
  eventId,
  maxSpots,
  taken,
  myStatus,
  joinMode,
  loggedIn,
  ended,
  cancelled,
  blocked,
  isHost,
  hostName,
  myNote,
  hasAbout,
}: {
  eventId: string;
  maxSpots: number;
  /** Approved people only. */
  taken: number;
  myStatus: Status;
  joinMode: "open" | "request";
  loggedIn: boolean;
  ended: boolean;
  cancelled: boolean;
  /** Why a logged-in viewer can't join: profile incomplete, or outside the age range. */
  blocked: { kind: "profile" } | { kind: "age"; label: string } | null;
  isHost: boolean;
  hostName: string;
  /** The intro the viewer sent with their pending request, if any. */
  myNote: string | null;
  /** Whether the viewer has filled in "about you", which hosts see with a request. */
  hasAbout: boolean;
}) {
  const isRequest = joinMode === "request";
  const [error, setError] = useState<string>();
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [state, setOptimistic] = useOptimistic(
    { status: myStatus, taken },
    (current, action: "join" | "leave") => {
      if (action === "leave") {
        return { status: null as Status, taken: current.taken - (current.status === "approved" ? 1 : 0) };
      }
      const status: Status = isRequest ? "pending" : "approved";
      return { status, taken: current.taken + (status === "approved" ? 1 : 0) };
    }
  );

  const left = Math.max(maxSpots - state.taken, 0);
  const full = left === 0 && !state.status;

  function act(action: "join" | "leave", intro = "") {
    setError(undefined);
    startTransition(async () => {
      setOptimistic(action);
      const result = await setRsvp(eventId, action === "join", intro);
      if (result.error) setError(result.error);
    });
  }

  function sendRequest(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateRequestNote(note);
    setNoteError(problem);
    if (!problem) act("join", note);
  }

  const disabled = (label: string) => (
    <button disabled className="btn-primary w-full">
      {label}
    </button>
  );

  let body: React.ReactNode;
  if (cancelled) body = disabled("Cancelled");
  else if (ended) body = disabled("Ended");
  else if (state.status === "approved") {
    body = (
      <button onClick={() => act("leave")} disabled={pending} className="btn-secondary w-full">
        Leave
      </button>
    );
  } else if (state.status === "pending") {
    body = (
      <div className="space-y-2">
        <p className="text-sm text-muted">
          Request sent. The host will look it over, and you&rsquo;ll see their answer here.
        </p>
        {myNote && (
          <blockquote className="whitespace-pre-line border-l-2 border-line pl-3 text-sm text-muted">
            {myNote}
          </blockquote>
        )}
        <button onClick={() => act("leave")} disabled={pending} className="btn-secondary w-full">
          Cancel request
        </button>
      </div>
    );
  } else if (state.status === "declined") body = disabled("Not approved this time");
  else if (full) body = disabled("Full");
  else if (!loggedIn) {
    body = (
      <Link href={`/login?next=/events/${eventId}`} className="btn-primary w-full">
        {isRequest ? "Request to join" : "Join"}
      </Link>
    );
  } else if (blocked) {
    body =
      blocked.kind === "profile" ? (
        <Link href={`/welcome?next=/events/${eventId}`} className="btn-primary w-full">
          Finish your profile to join
        </Link>
      ) : (
        disabled(`For ages ${blocked.label}`)
      );
  } else if (isRequest && !isHost) {
    body = writing ? (
      <form onSubmit={sendRequest} className="space-y-2">
        <label htmlFor="request-note" className="block text-sm font-semibold">
          Add a note for {hostName} <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="request-note"
          rows={5}
          maxLength={NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything you'd like the host to know."
          className={`field text-sm ${noteError ? "field-error" : ""}`}
        />
        <p className="text-xs text-muted">Only the host sees this, along with your profile.</p>
        {!hasAbout && (
          <div className="rounded-xl bg-accent-soft px-3 py-2 text-xs text-ink/90">
            You haven&rsquo;t added your bio yet. Hosts see it with your request, so it helps to have one.
            <Link href="/me#about" className="tap mt-1 flex justify-start font-semibold text-accent-dark underline">
              Add your bio
            </Link>
          </div>
        )}
        {noteError && <p className="text-sm text-red-600">{noteError}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? "Sending…" : "Send request"}
          </button>
          <button
            type="button"
            onClick={() => {
              setWriting(false);
              setNoteError(undefined);
            }}
            className="btn-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    ) : (
      <button onClick={() => setWriting(true)} className="btn-primary w-full">
        Request to join
      </button>
    );
  } else {
    body = (
      <button onClick={() => act("join")} disabled={pending} className="btn-primary w-full">
        Join
      </button>
    );
  }

  return (
    <div className="card p-4">
      {!cancelled && (
        <p className="mb-3 text-sm font-medium">
          <span className="text-lg font-bold">{left}</span> of {maxSpots} spots left
          {isRequest && <span className="text-muted"> · host approves each person</span>}
        </p>
      )}
      {body}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
