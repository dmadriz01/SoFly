"use client";

import { useEffect, useState, useTransition } from "react";
import { savePushSubscription } from "@/app/actions";
import { enableThisDevice, pushSupport, thisDeviceSubscription } from "@/lib/push-client";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const DISMISSED = "sofly_push_prompt";

type State = "hidden" | "ask" | "ios" | "done";

/**
 * Asked at the moment it makes sense: right after someone joins a meetup, when a reminder is
 * something they want. Not on arrival, and never again once they say "Not now".
 */
export function PushPrompt() {
  const [state, setState] = useState<State>("hidden");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!PUBLIC_KEY) return;
    (async () => {
      try {
        if (localStorage.getItem(DISMISSED)) return;
      } catch {
        // Storage blocked: we may ask again next time, which is fine.
      }
      const support = pushSupport();
      if (support === "unsupported") return;
      if (support === "ios-install") return setState("ios");
      if (Notification.permission === "denied") return;
      try {
        if (await thisDeviceSubscription()) return; // already on
      } catch {
        return;
      }
      setState("ask");
    })();
  }, []);

  if (state === "hidden") return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // ignore
    }
    setState("hidden");
  };

  function turnOn() {
    setError(undefined);
    startTransition(async () => {
      const result = await enableThisDevice(PUBLIC_KEY, savePushSubscription);
      if (result.ok) return setState("done");
      if (result.reason === "error") return setError(result.message);
      dismiss(); // said no in the browser's own box: don't ask again
    });
  }

  if (state === "done") {
    return (
      <p role="status" className="rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent-dark">
        <span className="font-semibold">Notifications are on.</span> We&rsquo;ll remind you before it starts.
      </p>
    );
  }

  return (
    <section aria-labelledby="push-prompt-heading" className="card space-y-2 p-4">
      <h2 id="push-prompt-heading" className="text-sm font-semibold">
        {state === "ios" ? "Want a reminder before it starts?" : "Get a heads-up before it starts"}
      </h2>
      {state === "ask" ? (
        <>
          <p className="text-xs text-muted">We&rsquo;ll remind you the day before, and tell you right away if the host changes anything or cancels.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={turnOn} disabled={pending} className="btn-primary btn !py-2 text-sm">
              {pending ? "Turning on…" : "Turn on notifications"}
            </button>
            <button type="button" onClick={dismiss} className="btn-secondary btn !py-2 text-sm">
              Not now
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-muted">
            On iPhone, notifications work once SoFly is on your Home Screen: tap Share in Safari, then <strong>Add to Home Screen</strong>, and turn them on
            from <strong>Me</strong>.
          </p>
          <button type="button" onClick={dismiss} className="btn-secondary btn !py-2 text-sm">
            Got it
          </button>
        </>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}
