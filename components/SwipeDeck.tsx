"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { passEvent, setRsvp, unpassEvent } from "@/app/actions";
import { CATEGORY_STYLES, emojiFor, isCategory } from "@/lib/constants";
import { NOTE_MAX, validateRequestNote } from "@/lib/validation";

export type DeckEvent = {
  id: string;
  title: string;
  category: string;
  when: string;
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

const THRESHOLD = 90; // px of horizontal drag that counts as a decision
const EXIT_MS = 260;

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
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const scroller = useRef<HTMLDivElement>(null);
  // Mirrors `gone` so async callbacks can tell whether a card has already been removed.
  const goneRef = useRef<Set<string>>(new Set());
  // Cards whose join failed while they were still animating out: they must not be removed.
  const keep = useRef<Set<string>>(new Set());

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const hide = (id: string) => {
    goneRef.current.add(id);
    setGone(new Set(goneRef.current));
  };
  const show = (id: string) => {
    goneRef.current.delete(id);
    setGone(new Set(goneRef.current));
  };

  /** A card finished animating out. Returns false if it should stay (its action failed). */
  function exited(id: string): boolean {
    if (keep.current.delete(id)) return false;
    hide(id);
    return true;
  }

  /** The action behind a swipe failed: put the card back, whether or not it has left yet. */
  function bringBack(id: string) {
    if (goneRef.current.has(id)) restore(id);
    else keep.current.add(id);
  }

  /** Bring a card back and scroll to it (otherwise the browser keeps you on the card you were on). */
  function restore(id: string) {
    show(id);
    setTimeout(() => {
      const el = document.getElementById(`deck-card-${id}`);
      if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop, behavior: "smooth" });
    }, 60);
  }

  function flash(text: string, undo?: () => void) {
    clearTimeout(toastTimer.current);
    setToast({ text, undo });
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  /** Called when a card is swiped or a button is pressed. "rejected" springs the card back. */
  function decide(event: DeckEvent, direction: Direction): "accepted" | "rejected" {
    if (direction === "left") {
      if (loggedIn) void passEvent(event.id);
      flash(`Passed on ${event.title}`, () => {
        restore(event.id);
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
      // The host needs an intro, so ask for it before anything is sent.
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
          restore(event.id);
          void setRsvp(event.id, false);
        });
      }
    })();
    return "accepted";
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

  return (
    <div>
      <p className="mb-2 text-center text-xs text-muted">
        Swipe right to join · left to pass · up or down to browse
        {visible.length > 0 && ` · ${visible.length} left`}
      </p>

      {visible.length === 0 ? (
        <div className="card px-6 py-12 text-center">
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
        <div
          ref={scroller}
          className="relative snap-y snap-mandatory overflow-y-auto overscroll-contain"
          style={{ height: "min(36rem, calc(100dvh - 16rem))", minHeight: "26rem" }}
        >
          {visible.map((event) => (
            <div key={event.id} id={`deck-card-${event.id}`} className="h-full snap-start snap-always pb-2">
              <SwipeCard event={event} onDecide={decide} onExited={exited} />
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-4 bottom-24 z-30 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-lg md:bottom-8"
        >
          <span className="min-w-0 truncate">{toast.text}</span>
          {toast.undo && (
            <button
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
              className="shrink-0 font-semibold text-accent-soft underline"
            >
              Undo
            </button>
          )}
        </div>
      )}

      {sheet?.kind === "login" && (
        <Sheet title="Log in to join" onClose={() => setSheet(null)}>
          <p className="text-muted">Log in with your email to join meetups. It only takes a moment.</p>
          <Link
            href={`/login?next=${encodeURIComponent(returnTo)}`}
            className="btn-primary mt-4 w-full"
          >
            Log in
          </Link>
        </Sheet>
      )}
      {sheet?.kind === "profile" && (
        <Sheet title="Finish your profile" onClose={() => setSheet(null)}>
          <p className="text-muted">
            We need your birthday before you can join, since some meetups have age requirements.
          </p>
          <Link
            href={`/welcome?next=${encodeURIComponent(returnTo)}`}
            className="btn-primary mt-4 w-full"
          >
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

function SwipeCard({
  event,
  onDecide,
  onExited,
}: {
  event: DeckEvent;
  onDecide: (event: DeckEvent, direction: Direction) => "accepted" | "rejected";
  onExited: (id: string) => boolean;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<Direction | null>(null);
  const drag = useRef<{ x: number; y: number; axis: "x" | "y" | null } | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(exitTimer.current), []);

  function commit(direction: Direction) {
    if (leaving) return;
    if (onDecide(event, direction) === "rejected") {
      setDx(0);
      return;
    }
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(10);
    setLeaving(direction);
    exitTimer.current = setTimeout(() => {
      // If the action failed meanwhile, the deck asks the card to stay: reset it.
      if (!onExited(event.id)) {
        setLeaving(null);
        setDx(0);
      }
    }, EXIT_MS);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (leaving || (e.target as HTMLElement).closest("a, button")) return;
    drag.current = { x: e.clientX, y: e.clientY, axis: null };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const moveX = e.clientX - d.x;
    const moveY = e.clientY - d.y;
    if (!d.axis) {
      if (Math.abs(moveX) > 8 && Math.abs(moveX) > Math.abs(moveY) * 1.2) {
        d.axis = "x";
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      } else if (Math.abs(moveY) > 8) {
        d.axis = "y"; // a vertical scroll; leave it to the browser
      }
    }
    if (d.axis === "x") setDx(moveX);
  }

  function onPointerEnd(e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (d?.axis !== "x") return;
    if (!cancelled && Math.abs(dx) > THRESHOLD) commit(dx > 0 ? "right" : "left");
    else setDx(0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      commit("right");
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      commit("left");
    }
  }

  const x = leaving ? (leaving === "right" ? 140 : -140) : 0;
  const style: React.CSSProperties = leaving
    ? {
        transform: `translateX(${x}%) rotate(${leaving === "right" ? 14 : -14}deg)`,
        opacity: 0,
        transition: `transform ${EXIT_MS}ms ease, opacity ${EXIT_MS}ms ease`,
      }
    : {
        transform: `translateX(${dx}px) rotate(${dx * 0.04}deg)`,
        transition: dragging ? "none" : "transform 200ms ease",
      };

  const cardStyle = isCategory(event.category) ? CATEGORY_STYLES[event.category] : "bg-slate-100";
  const joinOpacity = dx > 0 ? Math.min(dx / THRESHOLD, 1) : 0;
  const passOpacity = dx < 0 ? Math.min(-dx / THRESHOLD, 1) : 0;

  return (
    <div
      role="group"
      aria-label={`${event.title}. Press right arrow to ${event.requestMode ? "request to join" : "join"}, left arrow to pass.`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => onPointerEnd(e, false)}
      onPointerCancel={(e) => onPointerEnd(e, true)}
      style={style}
      className="relative flex h-full touch-pan-y select-none flex-col overflow-hidden rounded-3xl border border-line bg-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <div className={`flex items-center justify-center py-6 text-6xl ${cardStyle}`} aria-hidden>
        {emojiFor(event.category)}
      </div>

      <div className="flex-1 space-y-2 overflow-hidden p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-muted">{event.category}</span>
          {event.matchesInterests && (
            <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-dark">
              Matches your interests
            </span>
          )}
          {event.tags.map((t) => (
            <span
              key={t}
              className="rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-ink"
            >
              {t}
            </span>
          ))}
        </div>
        <h2 className="text-2xl font-bold leading-tight tracking-tight">{event.title}</h2>
        <p className="font-semibold text-accent-dark">{event.when}</p>
        <p className="text-sm text-muted">
          {event.neighborhood} · {event.requestMode ? "Address shared after approval" : event.venue}
        </p>
        {event.blurb && <p className="line-clamp-3 text-sm text-ink/80">{event.blurb}</p>}
        <p className="text-xs text-muted">
          {event.spotsLeft} of {event.maxSpots} spots left · hosted by {event.hostName}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line p-3">
        <button
          type="button"
          onClick={() => commit("left")}
          className="btn-secondary !px-5 !py-2.5 text-sm"
        >
          ✕ Pass
        </button>
        <Link
          href={`/events/${event.id}`}
          className="text-sm font-medium text-muted underline hover:text-ink"
        >
          Details
        </Link>
        <button
          type="button"
          onClick={() => commit("right")}
          className="btn-primary !px-5 !py-2.5 text-sm"
        >
          {event.requestMode ? "Request" : "Join"} ✓
        </button>
      </div>

      <span
        aria-hidden
        style={{ opacity: joinOpacity }}
        className="pointer-events-none absolute left-5 top-5 -rotate-12 rounded-lg border-4 border-emerald-600 px-3 py-1 text-2xl font-extrabold text-emerald-600"
      >
        {event.requestMode ? "REQUEST" : "JOIN"}
      </span>
      <span
        aria-hidden
        style={{ opacity: passOpacity }}
        className="pointer-events-none absolute right-5 top-5 rotate-12 rounded-lg border-4 border-slate-500 px-3 py-1 text-2xl font-extrabold text-slate-500"
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
        className="absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl"
      >
        <h2 className="mb-2 text-lg font-bold">{title}</h2>
        {children}
        <button onClick={onClose} className="mt-3 w-full text-center text-sm font-medium text-muted underline">
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
          {event.title} needs the host&rsquo;s approval. A note is optional; they&rsquo;ll see your
          profile either way.
        </p>
        <textarea
          autoFocus
          rows={5}
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
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={sending} className="btn-primary w-full">
          {sending ? "Sending…" : "Send request"}
        </button>
      </form>
    </Sheet>
  );
}
