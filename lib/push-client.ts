// Browser-side helpers for push notifications. Runs only in the browser.

export type PushSupport = "ok" | "ios-install" | "unsupported";

/** Whether this browser can do push, and if not, whether installing the site to the Home Screen would fix it. */
export function pushSupport(): PushSupport {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  // On iPhone and iPad, push only exists for sites added to the Home Screen.
  if (ios && !standalone) return "ios-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  return "ok";
}

/** The browser wants the public key as bytes, not as text. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function pushRegistration() {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

/** This device's current subscription, if any. */
export async function thisDeviceSubscription() {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Plain-English version of what went wrong while turning push on. */
export function explainPushError(err: unknown): string {
  const e = err as { name?: string; message?: string };
  if (e?.name === "NotAllowedError") return "Notifications are blocked for this site. Allow them in your browser settings, then try again.";
  if (e?.name === "AbortError" || /push service/i.test(e?.message ?? ""))
    return "Your browser couldn't reach its notification service. Check your connection and try again.";
  return `Couldn't turn push on${e?.message ? `: ${e.message.slice(0, 120)}` : "."}`;
}
