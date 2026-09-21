"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { passEvent, setRsvp, unpassEvent } from "@/app/actions";
import { EventCover } from "@/components/EventCover";
import { emojiFor } from "@/lib/constants";
import { NOTE_MAX, validateRequestNote } from "@/lib/validation";

export type DeckEvent = {
  id: string;
  title: string;
  category: string;
  when: string;
  /** The raw start time and skill level: they shape the cover picture. */
  startsAt: string;
  skill: string;
  neighborhood: string;
  venue: string;
  spotsLeft: number;
  maxSpots: number;
  blurb: string;
  hostName: string;
  requestMode: boolean;
  tags: string[];
  matchesInterests: boolean;
};

type Direction = "left" | "right";
type SheetState =
  | null
  | { kind: "login" }
  | { kind: "profile" }
  | { kind: "note"; event: DeckEvent };
type ToastState = null | { text: string; undo?: () => void };

const THRESHOLD = 90; // px dragged sideways that counts as a decision
const FLICK_SPEED = 0.6; // px per ms: a quick flick counts even if it didn't go far
const FLICK_MIN = 30; // ...as long as it went at least this far
const EXIT_MS = 280;

/**
 * The swipe screen: one card floats on screen with the next waiting behind it. Drag it left to
 * pass or right to join. There is no scrolling and no vertical browsing; the only way forward is a
 * decision. (While this is on screen the page itself can't scroll on a phone; see globals.css.)
 */
export function SwipeDeck({
  events,
  loggedIn,
  hasProfile,
  hasAbout,
  returnTo,
  listHref,
}: {
  events: DeckEvent[];
  loggedIn: boolean;
  hasProfile: boolean;
  /** Whether they've filled in "about you" (hosts see it with a request). */
  hasAbout: boolean;
  /** Where to come back to after logging in or finishing a profile. */
  returnTo: string;
  listHref: string;
}) {
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const [leaving, setLeaving] = useState<{ id: string; direction: Direction } | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const exitTimer = useRef<ReturnType<typeof setTimeout>>();
  // Mirrors `gone` so async callbacks can tell whether a card has already been removed.
  const goneRef = useRef<Set<string>>(new Set());
  // Cards whose join failed while they were still animating out: they must not be removed.
  const keep = useRef<Set<string>>(new Set());

  // Keep the page still while cards are on screen (phones only; the rule lives in globals.css).
  useEffect(() => {
    document.documentElement.classList.add("swipe-lock");
    return () => document.documentElement.classList.remove("swipe-lock");
  }, []);
  useEffect(
    () => () => {
      clearTimeout(toastTimer.current);
      clearTimeout(exitTimer.current);
    },
    []
  );

  const hide = (id: string) => {
    goneRef.current.add(id);
    setGone(new Set(goneRef.current));
  };
  const show = (id: string) => {
    goneRef.current.delete(id);
    setGone(new Set(goneRef.current));
  };

  function flash(text: string, undo?: () => void) {
    clearTimeout(toastTimer.current);
    setToast({ text, undo });
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  /** The action behind a swipe failed: put the card back, whether or not it has left yet. */
  function bringBack(id: string) {
    if (goneRef.current.has(id)) show(id);
    else keep.current.add(id);
  }

  /** Called when a card is swiped or a button is pressed. "rejected" springs the card back. */
  function decide(event: DeckEvent, direction: Direction): "accepted" | "rejected" {
    if (direction === "left") {
      if (loggedIn) void passEvent(event.id);
      flash(`Passed on ${event.title}`, () => {
        show(event.id);
        if (loggedIn) void unpassEvent(event.id);
      });
      return "accepted";
    }

    if (!loggedIn) {
      setSheet({ kind: "login" });
      return "rejected";
    }
    if (!hasProfile) {
      setSheet({ kind: "profile" });
      return "rejected";
    }
    if (event.requestMode) {
      // The host approves each person, so offer a note before anything is sent.
      setSheet({ kind: "note", event });
      return "rejected";
    }

    void (async () => {
      const result = await setRsvp(event.id, true);
      if (result.error) {
        bringBack(event.id);
        flash(result.error);
      } else {
        flash(`You're in: ${event.title}`, () => {
          show(event.id);
          void setRsvp(event.id, false);
        });
      }
    })();
    return "accepted";
  }

  /** A swipe or button press on the top card. Returns whether it went through. */
  function commit(event: DeckEvent, direction: Direction): boolean {
    if (leaving) return false;
    if (decide(event, direction) === "rejected") return false;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(10);
    setLeaving({ id: event.id, direction });
    exitTimer.current = setTimeout(() => {
      // If the action failed meanwhile, the card stays: just bring it back into place.
      if (keep.current.delete(event.id)) setLeaving(null);
      else {
        hide(event.id);
        setLeaving(null);
      }
    }, EXIT_MS);
    return true;
  }

  async function sendRequest(event: DeckEvent, note: string): Promise<string | undefined> {
    const result = await setRsvp(event.id, true, note);
    if (result.error) return result.error;
    hide(event.id);
    setSheet(null);
    flash(`Request sent to ${event.hostName}`);
    return undefined;
  }

  const visible = events.filter((e) => !gone.has(e.id));
  const top = visible[0];
  // Only two cards are ever drawn: the one you're deciding on, and the next one waiting behind it.
  const stack = visible.slice(0, 2);

  return (
    <div className="relative mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col md:h-[40rem] md:flex-none">
      {visible.length === 0 ? (
        <div className="card m-auto w-full px-6 py-12 text-center">
          <p className="text-lg font-semibold">You&rsquo;re all caught up</p>
          <p className="mx-auto mt-1 max-w-xs text-muted">
            No more meetups to show right now. Try different filters, or post your own.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/events/new" className="btn-primary">
              Post a meetup
            </Link>
            <Link href={listHref} className="btn-secondary">
              See the full list
            </Link>
          </div>
        </div>
      ) : (
        <>
          <p className="pb-2 text-center text-xs text-muted [@media(max-height:639px)]:pb-1">
            <span className="[@media(max-height:639px)]:hidden">Swipe right to join · left to pass · </span>
            {visible.length} left
          </p>

          <div className="relative min-h-0 flex-1" data-testid="deck">
            {[...stack].reverse().map((event) => {
              const depth = event.id === top.id ? 0 : 1;
              return (
                <SwipeCard
                  key={event.id}
                  event={event}
                  depth={depth}
                  leaving={leaving?.id === event.id ? leaving.direction : null}
                  onCommit={(direction) => commit(event, direction)}
                />
              );
            })}
          </div>

          <div className="flex shrink-0 items-center justify-center gap-6 pb-1 pt-2">
            <RoundButton label="Pass" size="lg" onClick={() => commit(top, "left")} tone="pass">
              ✕
            </RoundButton>
            <Link
              href={`/events/${top.id}`}
              aria-label={`Details for ${top.title}`}
              className="flex flex-col items-center gap-1 text-[0.7rem] font-medium text-muted"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-lg text-ink shadow-sm">
                ⓘ
              </span>
              <span className="[@media(max-height:639px)]:hidden">Details</span>
            </Link>
            <RoundButton label={top.requestMode ? "Request" : "Join"} size="lg" onClick={() => commit(top, "right")} tone="join">
              ✓
            </RoundButton>
          </div>
        </>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-x-2 top-1 z-30 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-cream shadow-lg"
        >
          <span className="min-w-0 truncate">{toast.text}</span>
          {toast.undo && (
            <button
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
              className="tap shrink-0 px-1 font-semibold text-accent-soft underline"
            >
              Undo
            </button>
          )}
        </div>
      )}

      {sheet?.kind === "login" && (
        <Sheet title="Log in to join" onClose={() => setSheet(null)}>
          <p className="text-muted">Log in with your email to join meetups. It only takes a moment.</p>
          <Link href={`/login?next=${encodeURIComponent(returnTo)}`} className="btn-primary mt-4 w-full">
            Log in
          </Link>
        </Sheet>
      )}
      {sheet?.kind === "profile" && (
        <Sheet title="Finish your profile" onClose={() => setSheet(null)}>
          <p className="text-muted">
            We need your birthday before you can join, since some meetups have age requirements.
          </p>
          <Link href={`/welcome?next=${encodeURIComponent(returnTo)}`} className="btn-primary mt-4 w-full">
            Finish profile
          </Link>
        </Sheet>
      )}
      {sheet?.kind === "note" && (
        <NoteSheet
          hasAbout={hasAbout}
          event={sheet.event}
          onClose={() => setSheet(null)}
          onSend={(note) => sendRequest(sheet.event, note)}
        />
      )}
    </div>
  );
}

function RoundButton({
  label,
  size,
  tone,
  onClick,
  children,
}: {
  label: string;
  size: "lg";
  tone: "pass" | "join";
  onClick: () => void;
  children: React.ReactNode;
}) {
  void size;
  return (
    <button type="button" onClick={onClick} aria-label={label} className="flex flex-col items-center gap-1 text-[0.7rem] font-medium text-muted">
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold shadow-md transition active:scale-95 ${
          tone === "join" ? "bg-accent text-on-accent" : "border border-line bg-surface text-ink"
        }`}
      >
        {children}
      </span>
      <span className="[@media(max-height:639px)]:hidden">{label}</span>
    </button>
  );
}

function SwipeCard({
  event,
  depth,
  leaving,
  onCommit,
}: {
  event: DeckEvent;
  /** 0 is the card you're deciding on; 1 is the one waiting behind it. */
  depth: 0 | 1;
  leaving: Direction | null;
  /** Returns false if the decision didn't go through (the card springs back). */
  onCommit: (direction: Direction) => boolean;
}) {
  const router = useRouter();
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; startedAt: number; lastX: number; lastT: number; speed: number } | null>(null);

  // A card that came back (its action failed) returns to the middle.
  useEffect(() => {
    if (!leaving) {
      setDx(0);
      setDy(0);
    }
  }, [leaving]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (depth !== 0 || leaving) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, startedAt: Date.now(), lastX: e.clientX, lastT: e.timeStamp, speed: 0 };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.speed = (e.clientX - d.lastX) / dt;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    setDx(e.clientX - d.x);
    setDy(e.clientY - d.y);
  }

  function finish(e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    // Work from where the finger actually lifted, not from the last drawn frame: on a fast flick the
    // screen may not have redrawn since the final movement, so the stored position would be stale.
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const moved = Math.hypot(dx, dy);
    if (cancelled) {
      setDx(0);
      setDy(0);
      return;
    }
    // A tap (barely moved, quickly) opens the meetup instead of deciding on it.
    if (moved < 8 && Date.now() - d.startedAt < 400) {
      setDx(0);
      setDy(0);
      router.push(`/events/${event.id}`);
      return;
    }
    const lastSegment = e.timeStamp - d.lastT;
    const speed = lastSegment > 0 ? (e.clientX - d.lastX) / lastSegment : d.speed;
    const flicked = (Math.abs(d.speed) > FLICK_SPEED || Math.abs(speed) > FLICK_SPEED) && Math.abs(dx) > FLICK_MIN;
    if (Math.abs(dx) > THRESHOLD || flicked) {
      const direction: Direction = dx > 0 ? "right" : "left";
      if (!onCommit(direction)) {
        setDx(0);
        setDy(0);
      }
    } else {
      setDx(0);
      setDy(0);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (depth !== 0) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      onCommit("right");
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      onCommit("left");
    }
  }

  const front = depth === 0;
  const transform = leaving
    ? `translate(${leaving === "right" ? 140 : -140}%, ${dy * 0.3}px) rotate(${leaving === "right" ? 18 : -18}deg)`
    : front
      ? `translate(${dx}px, ${dy * 0.3}px) rotate(${dx * 0.05}deg)`
      : "translateY(14px) scale(0.94)";
  const style: React.CSSProperties = {
    transform,
    opacity: leaving ? 0 : front ? 1 : 0.92,
    transition: dragging ? "none" : `transform ${EXIT_MS}ms cubic-bezier(.2,.8,.2,1), opacity ${EXIT_MS}ms ease`,
    zIndex: front ? 2 : 1,
    // The card handles every touch itself, so the browser never tries to scroll or zoom under it.
    touchAction: "none",
  };

  const joinOpacity = dx > 0 ? Math.min(dx / THRESHOLD, 1) : 0;
  const passOpacity = dx < 0 ? Math.min(-dx / THRESHOLD, 1) : 0;

  return (
    <div
      role={front ? "group" : undefined}
      aria-hidden={front ? undefined : true}
      aria-label={front ? `${event.title}. Press right arrow to ${event.requestMode ? "request to join" : "join"}, left arrow to pass.` : undefined}
      tabIndex={front ? 0 : -1}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, false)}
      onPointerCancel={(e) => finish(e, true)}
      style={style}
      data-depth={depth}
      className={`absolute inset-0 select-none outline-none [-webkit-touch-callout:none] [-webkit-user-select:none] ${
        front ? "cursor-grab active:cursor-grabbing" : "pointer-events-none"
      }`}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-lg">
        {/* The picture shrinks on shorter phones to make room for the words. */}
        <EventCover
          id={event.id}
          category={event.category}
          neighborhood={event.neighborhood}
          startsAt={event.startsAt}
          skill={event.skill}
          maxSpots={event.maxSpots}
          className="flex-[0_1_26%] min-h-[4.5rem] text-6xl [@media(max-height:639px)]:min-h-[2.75rem] [@media(max-height:639px)]:text-4xl"
        >
          <span aria-hidden className="drop-shadow-[0_2px_3px_rgba(0,0,0,0.25)]">{emojiFor(event.category)}</span>
        </EventCover>

        {/* Each line is either shown whole or left out: on shorter phones the extras drop away
            rather than being sliced in half. */}
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-4 [@media(max-height:639px)]:gap-1 [@media(max-height:639px)]:p-3">
          <div className="flex shrink-0 flex-nowrap items-center gap-1.5 overflow-hidden whitespace-nowrap [@media(max-height:639px)]:hidden">
            <span className="text-sm font-semibold text-muted">{event.category}</span>
            {[...(event.matchesInterests ? ["Matches your interests"] : []), ...event.tags].slice(0, 2).map((t, i) => (
              <span
                key={t}
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  i === 0 && event.matchesInterests ? "bg-accent-soft text-accent-dark" : "border border-line text-ink"
                }`}
              >
                {t}
              </span>
            ))}
          </div>
          <h2 className="line-clamp-2 shrink-0 text-2xl font-bold leading-tight tracking-tight [@media(max-height:639px)]:text-xl">
            {event.title}
          </h2>
          <p className="shrink-0 font-semibold text-accent-dark">{event.when}</p>
          <p className="line-clamp-1 shrink-0 text-sm text-muted">
            {event.neighborhood} · {event.requestMode ? "Address shared after approval" : event.venue}
          </p>
          {event.blurb && (
            <p className="line-clamp-2 shrink-0 text-sm text-ink/80 [@media(max-height:759px)]:hidden">{event.blurb}</p>
          )}
          <p className="mt-auto shrink-0 text-xs text-muted">
            {event.spotsLeft} of {event.maxSpots} spots left · hosted by {event.hostName}
          </p>
        </div>
      </div>

      <span
        aria-hidden
        style={{ opacity: joinOpacity }}
        className="pointer-events-none absolute left-5 top-5 -rotate-12 rounded-lg border-4 border-emerald-600 bg-surface/70 px-3 py-1 text-2xl font-extrabold text-emerald-600"
      >
        {event.requestMode ? "REQUEST" : "JOIN"}
      </span>
      <span
        aria-hidden
        style={{ opacity: passOpacity }}
        className="pointer-events-none absolute right-5 top-5 rotate-12 rounded-lg border-4 border-slate-500 bg-surface/70 px-3 py-1 text-2xl font-extrabold text-slate-500"
      >
        PASS
      </span>
    </div>
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-3xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl"
      >
        <h2 className="mb-2 text-lg font-bold">{title}</h2>
        {children}
        <button onClick={onClose} className="tap mt-2 w-full text-center text-sm font-medium text-muted underline">
          Not now
        </button>
      </div>
    </div>
  );
}

function NoteSheet({
  event,
  hasAbout,
  onClose,
  onSend,
}: {
  event: DeckEvent;
  hasAbout: boolean;
  onClose: () => void;
  onSend: (note: string) => Promise<string | undefined>;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateRequestNote(note);
    if (problem) {
      setError(problem);
      return;
    }
    setSending(true);
    setError(await onSend(note));
    setSending(false);
  }

  return (
    <Sheet title={`Add a note for ${event.hostName}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-2">
        <p className="text-sm text-muted">
          {event.title} needs the host&rsquo;s approval. A note is optional; they&rsquo;ll see your profile
          either way.
        </p>
        <textarea
          autoFocus
          rows={4}
          maxLength={NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Your note (optional)"
          className={`field text-sm ${error ? "field-error" : ""}`}
        />
        <p className="text-xs text-muted">Only the host sees this, along with your profile.</p>
        {!hasAbout && (
          <div className="rounded-xl bg-accent-soft px-3 py-2 text-xs text-ink/90">
            You haven&rsquo;t added your bio yet, and hosts see it with your request.
            <a href="/me#about" className="tap mt-1 flex justify-start font-semibold text-accent-dark underline">
              Add your bio
            </a>
          </div>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={sending} className="btn-primary w-full">
          {sending ? "Sending…" : "Send request"}
        </button>
      </form>
    </Sheet>
  );
}
