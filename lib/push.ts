import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { CONTACT_EMAIL, SITE_URL } from "./site";

export type PushPayload = { title: string; body: string; url: string; tag?: string };
export type PushOutcome = { sent: number; removed: number; failed: number; firstFailure?: string };
type Device = { endpoint: string; p256dh: string; auth: string };
export type PushSender = (device: Device, body: string) => Promise<void>;

/** The public half of the key pair; the browser needs it to subscribe. */
export const pushPublicKey = () => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** Whether push is set up on the server: both halves of the key pair. */
export const pushConfigured = () => Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

/** Who the push services should contact about us: a mailto: address or an https: site. */
export function vapidSubject(): string | null {
  const explicit = process.env.VAPID_SUBJECT;
  if (explicit) return explicit;
  if (CONTACT_EMAIL) return `mailto:${CONTACT_EMAIL}`;
  return SITE_URL.startsWith("https://") ? SITE_URL : null;
}

/**
 * Only real push services may be sent to. The address of a device comes from the browser that
 * subscribed, so without this someone could register an address that makes our server send a
 * request to any website they like.
 */
const PUSH_HOSTS = [
  "fcm.googleapis.com", // Chrome, Edge, Android
  "updates.push.services.mozilla.com", // Firefox
  "push.services.mozilla.com",
  "web.push.apple.com", // Safari, iPhone Home Screen apps
  "push.apple.com",
  "notify.windows.com", // Edge on Windows
];

export function isPushEndpoint(endpoint: string): boolean {
  if (endpoint.length > 2000) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

const trim = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

const realSender: PushSender = async (device, body) => {
  const subject = vapidSubject();
  if (!subject) throw new Error("No VAPID subject: set VAPID_SUBJECT or NEXT_PUBLIC_CONTACT_EMAIL");
  await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, body, {
    vapidDetails: { subject, publicKey: pushPublicKey(), privateKey: process.env.VAPID_PRIVATE_KEY ?? "" },
    TTL: 12 * 60 * 60, // if the phone is off, keep it for 12 hours
    urgency: "normal",
  });
};

/**
 * Sends a notification to every device a person has turned push on for. Devices the push service
 * says are gone (404/410) are forgotten. Never throws.
 */
export async function sendPushToUser(
  admin: SupabaseClient,
  userId: string,
  payload: PushPayload,
  deps: { send?: PushSender; configured?: boolean } = {}
): Promise<PushOutcome> {
  const outcome: PushOutcome = { sent: 0, removed: 0, failed: 0 };
  if (!(deps.configured ?? pushConfigured())) return outcome;
  const send = deps.send ?? realSender;

  try {
    const { data: devices } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
    const body = JSON.stringify({ ...payload, title: trim(payload.title, 80), body: trim(payload.body, 160) });

    for (const device of (devices ?? []) as (Device & { id: string })[]) {
      try {
        await send(device, body);
        outcome.sent++;
      } catch (err) {
        const e = err as { statusCode?: number; message?: string };
        if (e.statusCode === 404 || e.statusCode === 410) {
          outcome.removed++;
          await admin.from("push_subscriptions").delete().eq("id", device.id);
        } else {
          outcome.failed++;
          outcome.firstFailure ??= `${e.statusCode ? `status ${e.statusCode}: ` : ""}${(e.message ?? "unknown error").split("\n")[0].slice(0, 120)}`;
        }
      }
    }
  } catch (err) {
    console.error("Push failed:", err);
    outcome.failed++;
    outcome.firstFailure ??= "could not read subscriptions";
  }
  return outcome;
}
