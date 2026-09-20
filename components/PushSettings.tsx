"use client";

import { useEffect, useState, useTransition } from "react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/app/actions";
import type { Check } from "@/lib/diagnose";
import {
  explainPushError,
  pushRegistration,
  pushSupport,
  thisDeviceSubscription,
  urlBase64ToUint8Array,
} from "@/lib/push-client";
import { CheckList } from "./CheckList";

// Baked in at build time. Without it, push isn't set up and this whole card stays hidden.
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type Status = "checking" | "unsupported" | "ios-install" | "denied" | "off" | "on";

export function PushSettings() {
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string>();
  const [busy, startBusy] = useTransition();
  const [checks, setChecks] = useState<Check[]>();
  const [testError, setTestError] = useState<string>();
  const [testing, startTest] = useTransition();

  useEffect(() => {
    if (!PUBLIC_KEY) return;
    (async () => {
      const support = pushSupport();
      if (support !== "ok") return setStatus(support);
      if (Notification.permission === "denied") return setStatus("denied");
      try {
        const sub = await thisDeviceSubscription();
        if (!sub) return setStatus("off");
        // Re-link this device to whoever is signed in now (covers a phone that changed hands).
        const keys = sub.toJSON().keys;
        void savePushSubscription({ endpoint: sub.endpoint, p256dh: keys?.p256dh ?? "", auth: keys?.auth ?? "" });
        setStatus("on");
      } catch {
        setStatus("off");
      }
    })();
  }, []);

  if (!PUBLIC_KEY) return null;

  function turnOn() {
    setError(undefined);
    startBusy(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return setStatus(permission === "denied" ? "denied" : "off");
        const reg = await pushRegistration();
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY) as BufferSource,
          }));
        const keys = sub.toJSON().keys;
        const saved = await savePushSubscription({ endpoint: sub.endpoint, p256dh: keys?.p256dh ?? "", auth: keys?.auth ?? "" });
        if (saved.error) {
          await sub.unsubscribe();
          setError(saved.error);
          return setStatus("off");
        }
        setStatus("on");
      } catch (err) {
        setError(explainPushError(err));
        setStatus("off");
      }
    });
  }

  function turnOff() {
    setError(undefined);
    startBusy(async () => {
      try {
        const sub = await thisDeviceSubscription();
        if (sub) {
          await removePushSubscription(sub.endpoint);
          await sub.unsubscribe();
        }
        setChecks(undefined);
        setStatus("off");
      } catch (err) {
        setError(explainPushError(err));
      }
    });
  }

  function runTest() {
    setChecks(undefined);
    setTestError(undefined);
    startTest(async () => {
      const result = await sendTestPush();
      if (result.error) setTestError(result.error);
      else setChecks(result.checks);
    });
  }

  return (
    <div className="card space-y-3 p-4">
      <div>
        <p className="font-semibold">Push notifications on this device</p>
        <p className="text-sm text-muted">
          Get a notification when someone asks to join, a host answers, a meetup is cancelled, and the
          day before a meetup.
        </p>
      </div>

      {status === "checking" && <p className="text-sm text-muted">Checking…</p>}

      {status === "ios-install" && (
        <p className="rounded-xl bg-accent-soft p-3 text-sm text-ink/90">
          On iPhone and iPad, notifications only work once BayMeet is on your Home Screen. Tap the Share
          button in Safari, choose <strong>Add to Home Screen</strong>, then open BayMeet from there and
          come back to this page.
        </p>
      )}

      {status === "unsupported" && (
        <p className="text-sm text-muted">This browser doesn&rsquo;t support push notifications.</p>
      )}

      {status === "denied" && (
        <p className="text-sm text-muted">
          Notifications are blocked for BayMeet. Allow them in your browser or phone settings, then come
          back and turn this on.
        </p>
      )}

      {status === "off" && (
        <button type="button" onClick={turnOn} disabled={busy} className="btn-primary tap w-full sm:w-auto">
          {busy ? "Turning on…" : "Turn on notifications"}
        </button>
      )}

      {status === "on" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-900">
            On for this device
          </span>
          <button type="button" onClick={runTest} disabled={testing} className="btn-secondary tap !py-2 text-sm">
            {testing ? "Sending…" : "Send a test notification"}
          </button>
          <button type="button" onClick={turnOff} disabled={busy} className="tap text-sm font-medium text-muted underline">
            Turn off
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {testError && <p className="text-sm text-red-600">{testError}</p>}
      {checks && <CheckList checks={checks} />}
    </div>
  );
}
