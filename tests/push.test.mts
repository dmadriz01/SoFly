// Tests for push notifications: the device-address safety list, the sender, the real key and
// encryption wiring, who gets notified and when, the diagnostic, and the service worker itself.
// Run with `npm run test:unit`.
import crypto from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";
import webpush from "web-push";
import { iconUrl } from "../lib/brand.ts";
import { diagnosePush } from "../lib/diagnose.ts";
import { notifyEventCancelled, notifyEventDeleted, notifyHostOfRequest, notifyRequestDecision, sendDailyEmails, snapshotBeforeDelete } from "../lib/notify.ts";
import { isPushEndpoint, sendPushToUser, type PushPayload, type PushSender } from "../lib/push.ts";
import { fakeAdmin, fakeMailbox, type FakeData } from "./fake-supabase.mts";

let passed = 0;
let failed = 0;
const t = (name: string, cond: boolean, extra = "") => {
  cond ? passed++ : failed++;
  console.log(`${cond ? "ok   " : "FAIL "}${name}${cond ? "" : "  -> " + extra}`);
};
const quiet = console.log;
const silently = async <T,>(fn: () => Promise<T>) => {
  console.log = () => {};
  const err = console.error;
  console.error = () => {};
  try { return await fn(); } finally { console.log = quiet; console.error = err; }
};

// ───────── which device addresses are accepted ─────────
for (const good of [
  "https://fcm.googleapis.com/fcm/send/abc123",
  "https://updates.push.services.mozilla.com/wpush/v2/xyz",
  "https://web.push.apple.com/QAbcDef",
  "https://wns2-par02p.notify.windows.com/w/?token=abc",
]) t(`address accepted: ${good.slice(8, 40)}`, isPushEndpoint(good));
for (const [why, bad] of [
  ["plain http", "http://fcm.googleapis.com/x"],
  ["an unrelated site", "https://evil.example.com/x"],
  ["a look-alike suffix", "https://fcm.googleapis.com.evil.com/x"],
  ["a look-alike prefix", "https://evil-fcm.googleapis.com/x"],
  ["embedded credentials", "https://user:pw@fcm.googleapis.com/x"],
  ["a cloud metadata address", "https://169.254.169.254/latest/meta-data"],
  ["localhost", "https://localhost/x"],
  ["not a URL", "javascript:alert(1)"],
  ["empty", ""],
  ["too long", "https://fcm.googleapis.com/" + "x".repeat(2000)],
] as const) t(`address refused: ${why}`, !isPushEndpoint(bad));

// ───────── the sender ─────────
const device = (id: string, user = "u1") => ({ id, user_id: user, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: "k", auth: "a" });
const payload: PushPayload = { title: "T", body: "B", url: "/events/1", tag: "x" };
const sender = (fn: (d: { endpoint: string }) => void): { send: PushSender; calls: string[] } => {
  const calls: string[] = [];
  return { calls, send: async (d, body) => { calls.push(body); fn(d); } };
};

{
  const data: FakeData = { push_subscriptions: [device("a"), device("b"), device("c", "someone-else")] };
  const s = sender(() => {});
  const o = await sendPushToUser(fakeAdmin(data, {}), "u1", payload, { send: s.send, configured: true });
  t("push: goes to each of the person's devices, and only theirs", o.sent === 2 && s.calls.length === 2, JSON.stringify(o));
  t("push: the message carries title, body, url and tag", JSON.parse(s.calls[0]).url === "/events/1" && JSON.parse(s.calls[0]).tag === "x" && JSON.parse(s.calls[0]).title === "T");
}
{
  const data: FakeData = { push_subscriptions: [device("ok"), device("gone"), device("boom")] };
  const s = sender((d) => {
    if (d.endpoint.endsWith("gone")) throw Object.assign(new Error("Gone"), { statusCode: 410 });
    if (d.endpoint.endsWith("boom")) throw Object.assign(new Error("Server exploded"), { statusCode: 500 });
  });
  const o = await sendPushToUser(fakeAdmin(data, {}), "u1", payload, { send: s.send, configured: true });
  t("push: an expired device (410) is forgotten", o.removed === 1 && !data.push_subscriptions.some((d) => d.id === "gone"), JSON.stringify(o));
  t("push: a failing device is reported, and the others still get theirs", o.failed === 1 && o.sent === 1 && (o.firstFailure ?? "").includes("500"), JSON.stringify(o));
  t("push: the healthy devices are kept", data.push_subscriptions.length === 2);
}
{
  const s = sender(() => {});
  const o = await sendPushToUser(fakeAdmin({ push_subscriptions: [device("a")] }, {}), "u1", payload, { send: s.send, configured: false });
  t("push: not set up -> sends nothing", o.sent === 0 && s.calls.length === 0);
  const none = await sendPushToUser(fakeAdmin({ push_subscriptions: [] }, {}), "u1", payload, { send: s.send, configured: true });
  t("push: no devices -> sends nothing", none.sent === 0 && s.calls.length === 0);
  const long = sender(() => {});
  await sendPushToUser(fakeAdmin({ push_subscriptions: [device("a")] }, {}), "u1", { ...payload, title: "T".repeat(200), body: "B".repeat(500) }, { send: long.send, configured: true });
  const m = JSON.parse(long.calls[0]);
  t("push: long text is trimmed to fit a lock screen", m.title.length <= 80 && m.body.length <= 160);
}

// ───────── the real key and encryption wiring (no network) ─────────
{
  const vapid = webpush.generateVAPIDKeys();
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const sub = {
    endpoint: "https://fcm.googleapis.com/fcm/send/real-shape",
    keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") },
  };
  const message = JSON.stringify(payload);
  const details = webpush.generateRequestDetails(sub, message, { vapidDetails: { subject: "mailto:team@example.com", publicKey: vapid.publicKey, privateKey: vapid.privateKey }, TTL: 3600 });
  t("wiring: the request goes to the device's own address", details.endpoint === sub.endpoint);
  t("wiring: it is signed with our key (VAPID)", String(details.headers.Authorization).startsWith("vapid t=") && String(details.headers.Authorization).includes(`k=${vapid.publicKey}`));
  t("wiring: the message is encrypted, not plain text", details.headers["Content-Encoding"] === "aes128gcm" && !Buffer.from(details.body).includes("events/1"));
  t("wiring: the time-to-live is set", String(details.headers.TTL) === "3600");
  let refused = false;
  try { webpush.generateRequestDetails(sub, message, { vapidDetails: { subject: "not a valid contact", publicKey: vapid.publicKey, privateKey: vapid.privateKey } }); } catch { refused = true; }
  t("wiring: a malformed contact address is refused (and would be reported)", refused);

  // The production sender, end to end, against an address nothing is listening on: it must report
  // the failure rather than crash or hang.
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = vapid.publicKey;
  process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
  process.env.VAPID_SUBJECT = "mailto:team@example.com";
  const real = await silently(() =>
    sendPushToUser(
      fakeAdmin({ push_subscriptions: [{ id: "x", user_id: "u1", endpoint: "https://127.0.0.1:9/nothing", p256dh: sub.keys.p256dh, auth: sub.keys.auth }] }, {}),
      "u1",
      payload
    )
  );
  t("wiring: the real sender reports an unreachable push service instead of crashing", real.failed === 1 && real.sent === 0 && Boolean(real.firstFailure), JSON.stringify(real));
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
}

// ───────── who gets notified, and when ─────────
const users = { host: { email: "host@example.com" }, ann: { email: "ann@example.com" }, bob: { email: "bob@example.com" } };
const base = (): FakeData => ({
  events: [{ id: "ev1", title: "Pickeball", starts_at: "2026-09-22T00:00:00+00:00", host_id: "host", join_mode: "request", venue_name: "Shared after approval", address: "Oakland", cancelled_at: null }],
  event_locations: [{ event_id: "ev1", venue_name: "Court 3", address: "1 Main St, Oakland, CA" }],
  rsvps: [{ event_id: "ev1", user_id: "host", status: "approved" }],
  profiles: [{ id: "host", name: "David Madriz" }, { id: "ann", name: "Ann Lee" }, { id: "bob", name: "Bob Ray" }],
  user_settings: [],
});
const recorder = () => {
  const sent: { to: string; payload: PushPayload }[] = [];
  return { sent, push: async (to: string, p: PushPayload) => { sent.push({ to, payload: p }); return { sent: 1, removed: 0, failed: 0 }; } };
};
const NOW = new Date("2026-09-20T19:51:45Z");

{
  const r = recorder(); const box = fakeMailbox();
  await silently(() => notifyHostOfRequest("ev1", "ann", { admin: fakeAdmin(base(), users), send: box.send, push: r.push }));
  t("a join request pushes to the host", r.sent.length === 1 && r.sent[0].to === "host" && r.sent[0].payload.title === "Ann wants to join" && r.sent[0].payload.url === "/events/ev1", JSON.stringify(r.sent));
  t("...alongside the email", box.sent.length === 1);
}
{
  const d = base(); d.user_settings = [{ user_id: "host", email_notifications: false }];
  const r = recorder(); const box = fakeMailbox();
  await silently(() => notifyHostOfRequest("ev1", "ann", { admin: fakeAdmin(d, users), send: box.send, push: r.push }));
  t("emails switched off does NOT stop push (push has its own consent)", box.sent.length === 0 && r.sent.length === 1);
}
{
  const r = recorder();
  await silently(() => notifyHostOfRequest("ev1", "host", { admin: fakeAdmin(base(), users), send: fakeMailbox().send, push: r.push }));
  t("the host joining their own event pushes nothing", r.sent.length === 0);
  const open = base(); (open.events[0] as { join_mode: string }).join_mode = "open";
  await silently(() => notifyHostOfRequest("ev1", "ann", { admin: fakeAdmin(open, users), send: fakeMailbox().send, push: r.push }));
  t("an open event never pushes a request", r.sent.length === 0);
}
{
  const r = recorder();
  await silently(() => notifyRequestDecision("ev1", "ann", true, { admin: fakeAdmin(base(), users), send: fakeMailbox().send, push: r.push }));
  t("an approval pushes 'You're in!' to the requester", r.sent[0]?.to === "ann" && r.sent[0].payload.title === "You're in!", JSON.stringify(r.sent));
  t("...without putting the private address on the lock screen", !JSON.stringify(r.sent).includes("Court 3") && !JSON.stringify(r.sent).includes("Main St"));
  const r2 = recorder();
  await silently(() => notifyRequestDecision("ev1", "ann", false, { admin: fakeAdmin(base(), users), send: fakeMailbox().send, push: r2.push }));
  t("a decline pushes a kind update", r2.sent[0]?.payload.body.includes("couldn't fit you in"));
}
{
  const d = base(); d.rsvps.push({ event_id: "ev1", user_id: "ann", status: "approved" }, { event_id: "ev1", user_id: "bob", status: "pending" });
  const r = recorder();
  await silently(() => notifyEventCancelled("ev1", { admin: fakeAdmin(d, users), send: fakeMailbox().send, push: r.push, now: NOW }));
  t("a cancellation pushes to approved guests only", r.sent.length === 1 && r.sent[0].to === "ann" && r.sent[0].payload.title === "Cancelled: Pickeball", JSON.stringify(r.sent));
  t("...and tapping it opens the (cancelled) meetup page", r.sent[0].payload.url === "/events/ev1" && r.sent[0].payload.body === "The host cancelled this meetup.", JSON.stringify(r.sent[0].payload));
  const rm = recorder();
  await silently(() => notifyEventCancelled("ev1", { admin: fakeAdmin(d, users), send: fakeMailbox().send, push: rm.push, now: NOW }, "moderator"));
  t("a moderator's cancellation pushes 'BayMeet cancelled this meetup.'", rm.sent[0]?.payload.body === "BayMeet cancelled this meetup.", JSON.stringify(rm.sent));
}
{
  // a guest with emails switched off still gets the push (push has its own consent), and vice versa
  const d = base(); d.rsvps.push({ event_id: "ev1", user_id: "ann", status: "approved" }, { event_id: "ev1", user_id: "bob", status: "approved" });
  d.user_settings.push({ user_id: "ann", email_notifications: false });
  const r = recorder(); const box = fakeMailbox();
  await silently(() => notifyEventCancelled("ev1", { admin: fakeAdmin(d, users), send: box.send, push: r.push, now: NOW }));
  t("emails off: no email for that guest, but the push still goes out", box.sent.map((m) => m.to).join() === "bob@example.com" && r.sent.map((x) => x.to).sort().join() === "ann,bob", JSON.stringify({ mail: box.sent.map((m) => m.to), push: r.sent.map((x) => x.to) }));
}
{
  // deleting: same people, same channels, and the push opens the feed since the page is gone
  const d = base(); d.rsvps.push({ event_id: "ev1", user_id: "ann", status: "approved" });
  const snap = await snapshotBeforeDelete("ev1", { admin: fakeAdmin(d, users), now: NOW });
  d.events = []; d.rsvps = [];
  const r = recorder(); const box = fakeMailbox();
  await silently(() => notifyEventDeleted(snap!, { admin: fakeAdmin(d, users), send: box.send, push: r.push }));
  t("a deleted meetup: the guest gets an email AND a push", box.sent.length === 1 && box.sent[0].to === "ann@example.com" && r.sent.length === 1 && r.sent[0].to === "ann", JSON.stringify({ mail: box.sent.length, push: r.sent }));
  t("...the push opens the feed, not a page that no longer exists", r.sent[0].payload.url === "/");
}
{
  const d = base(); d.rsvps.push({ event_id: "ev1", user_id: "ann", status: "approved" }, { event_id: "ev1", user_id: "bob", status: "pending" });
  const r = recorder(); const box = fakeMailbox();
  const res = await silently(() => sendDailyEmails(NOW, { admin: fakeAdmin(d, users), send: box.send, push: r.push }));
  t("the daily job pushes tomorrow's reminder to the host and approved guests", r.sent.map((x) => x.to).sort().join() === "ann,host" && res.pushes === 2, JSON.stringify(r.sent));
  t("...with the time and venue name, but not the full address", r.sent[0].payload.body.includes("5:00 PM") && r.sent[0].payload.body.includes("Court 3") && !r.sent[0].payload.body.includes("Main St"), r.sent[0].payload.body);
  t("...and the emails still go out too", box.sent.length === 2 && res.reminders === 2);
}
{
  const d = base(); (d.events[0] as { starts_at: string }).starts_at = "2026-09-20T02:00:00Z";
  d.rsvps.push({ event_id: "ev1", user_id: "ann", status: "approved" });
  const r = recorder();
  const res = await silently(() => sendDailyEmails(NOW, { admin: fakeAdmin(d, users), send: fakeMailbox().send, push: r.push }));
  t("the daily job pushes 'How was it?' to yesterday's guests, not the host", r.sent.length === 1 && r.sent[0].to === "ann" && r.sent[0].payload.title === "How was Pickeball?" && res.pushes === 1, JSON.stringify(r.sent));
}
{
  const r = recorder(); const box = fakeMailbox();
  const res = await silently(() => sendDailyEmails(NOW, { admin: fakeAdmin(base(), users), send: box.send, push: r.push, mailConfigured: false, pushConfigured: true }));
  t("push-only setup: no email is attempted, but the push still goes out", box.sent.length === 0 && r.sent.length === 1 && res.reminders === 0 && res.pushes === 1, JSON.stringify(res));
  const r2 = recorder(); const box2 = fakeMailbox();
  const res2 = await silently(() => sendDailyEmails(NOW, { admin: fakeAdmin(base(), users), send: box2.send, push: r2.push, mailConfigured: true, pushConfigured: false }));
  t("email-only setup: no push is attempted, the email still goes out", r2.sent.length === 0 && box2.sent.length === 1 && res2.reminders === 1);
  const res3 = await silently(() => sendDailyEmails(NOW, { admin: fakeAdmin(base(), users), send: fakeMailbox().send, push: recorder().push, mailConfigured: false, pushConfigured: false }));
  t("nothing set up: says so and does nothing", (res3.note ?? "").includes("Neither") && res3.reminders === 0 && res3.pushes === 0, JSON.stringify(res3));
}
{
  const failing = { sent: [] as unknown[], push: async () => ({ sent: 0, removed: 0, failed: 1, firstFailure: "status 500: down" }) };
  const res = await silently(() => sendDailyEmails(NOW, { admin: fakeAdmin(base(), users), send: fakeMailbox().send, push: failing.push }));
  t("a failing push service is counted and explained, and doesn't stop email", res.pushFailed === 1 && (res.firstFailure ?? "").includes("push: status 500") && res.reminders === 1, JSON.stringify(res));
}

// ───────── the push diagnostic names the broken link ─────────
{
  const data: FakeData = { push_subscriptions: [device("a", "host")] };
  const failing = (checks: { label: string; ok: boolean }[]) => checks.filter((c) => !c.ok).map((c) => c.label).join(" | ") || "(none)";
  const ok = { publicKeySet: true, privateKeySet: true, subject: "mailto:a@b.com" };
  let c = await diagnosePush({ userId: "host" }, { ...ok, admin: fakeAdmin(data, {}), push: async () => ({ sent: 1, removed: 0, failed: 0 }) });
  t("push diagnostic: everything set up -> all green", failing(c) === "(none)", failing(c));
  c = await diagnosePush({ userId: "host" }, { ...ok, publicKeySet: false, admin: fakeAdmin(data, {}) });
  t("push diagnostic: no public key -> says so", failing(c) === "Push public key is set up", failing(c));
  c = await diagnosePush({ userId: "host" }, { ...ok, privateKeySet: false, admin: fakeAdmin(data, {}) });
  t("push diagnostic: no private key -> says so", failing(c) === "Push private key is set up", failing(c));
  c = await diagnosePush({ userId: "host" }, { ...ok, subject: null, admin: fakeAdmin(data, {}) });
  t("push diagnostic: no contact address -> says so", failing(c) === "Push contact address is set up", failing(c));
  c = await diagnosePush({ userId: "host" }, { ...ok, admin: null });
  t("push diagnostic: no server key -> says so", failing(c) === "Server key is set up", failing(c));
  c = await diagnosePush({ userId: "host" }, { ...ok, admin: fakeAdmin({ push_subscriptions: [] }, {}) });
  t("push diagnostic: no device yet -> tells you to turn push on first", failing(c) === "You have a device with push turned on", failing(c));
  c = await diagnosePush({ userId: "host" }, { ...ok, admin: fakeAdmin(data, {}), push: async () => ({ sent: 0, removed: 0, failed: 1, firstFailure: "status 403: bad key" }) });
  t("push diagnostic: a rejected notification shows the reason", failing(c) === "The push service accepted the test notification" && (c.find((x) => !x.ok)?.detail ?? "").includes("403"), failing(c));
}

// ───────── the service worker itself ─────────
{
  const source = fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  const build = (open: { url: string; focused?: boolean; navigated?: string }[] = []) => {
    const listeners: Record<string, (e: unknown) => void> = {};
    const shown: { title: string; options: Record<string, unknown> }[] = [];
    const opened: string[] = [];
    const clients = {
      claim: async () => {},
      matchAll: async () => open.map((c) => ({ url: c.url, focus: async () => { c.focused = true; }, navigate: async (u: string) => { c.navigated = u; } })),
      openWindow: async (u: string) => { opened.push(u); },
    };
    const self = {
      addEventListener: (type: string, fn: (e: unknown) => void) => { listeners[type] = fn; },
      skipWaiting: () => {},
      clients,
      registration: { showNotification: async (title: string, options: Record<string, unknown>) => { shown.push({ title, options }); } },
      location: { origin: "https://bay-meet.vercel.app" },
    };
    vm.runInNewContext(source, { self, URL });
    const fire = async (type: string, event: Record<string, unknown>) => {
      const waits: Promise<unknown>[] = [];
      listeners[type]({ ...event, waitUntil: (p: Promise<unknown>) => waits.push(p) });
      await Promise.all(waits);
    };
    return { fire, shown, opened, listeners };
  };
  const pushEvent = (json: unknown) => ({ data: { json: () => json, text: () => "plain words" } });
  const clickEvent = (url?: string) => ({ notification: { close: () => { closed++; }, data: url === undefined ? undefined : { url } } });
  let closed = 0;

  let sw = build();
  t("service worker: registers push and click handlers", "push" in sw.listeners && "notificationclick" in sw.listeners && "install" in sw.listeners);
  await sw.fire("push", pushEvent({ title: "Ann wants to join", body: "Pickeball", url: "/events/ev1", tag: "request-ev1" }));
  t("service worker: shows the notification with its title and text", sw.shown[0]?.title === "Ann wants to join" && sw.shown[0].options.body === "Pickeball");
  t("service worker: keeps the tag (so repeats replace each other) and uses our icon", sw.shown[0].options.tag === "request-ev1" && sw.shown[0].options.icon === iconUrl(192));
  t("service worker: remembers where to go on tap", (sw.shown[0].options.data as { url: string }).url === "/events/ev1");

  sw = build();
  await sw.fire("push", { data: null });
  t("service worker: an empty push still shows something (browsers require it)", sw.shown.length === 1 && sw.shown[0].title === "BayMeet");
  sw = build();
  await sw.fire("push", { data: { json: () => { throw new Error("not json"); }, text: () => "plain words" } });
  t("service worker: a message that isn't JSON is shown as text, not dropped", sw.shown[0]?.options.body === "plain words");

  sw = build();
  await sw.fire("notificationclick", clickEvent("/events/ev1"));
  t("service worker: tapping closes the notification", closed >= 1);
  t("service worker: with no window open, tapping opens the meetup", sw.opened[0] === "https://bay-meet.vercel.app/events/ev1", JSON.stringify(sw.opened));

  const already = { url: "https://bay-meet.vercel.app/events/ev1" } as { url: string; focused?: boolean; navigated?: string };
  sw = build([already]);
  await sw.fire("notificationclick", clickEvent("/events/ev1"));
  t("service worker: if that page is already open, it's brought to the front", already.focused === true && sw.opened.length === 0);

  const elsewhere = { url: "https://bay-meet.vercel.app/me" } as { url: string; focused?: boolean; navigated?: string };
  sw = build([elsewhere]);
  await sw.fire("notificationclick", clickEvent("/events/ev1"));
  t("service worker: an open BayMeet window is reused and sent to the meetup", elsewhere.focused === true && elsewhere.navigated === "https://bay-meet.vercel.app/events/ev1" && sw.opened.length === 0);

  sw = build();
  await sw.fire("notificationclick", clickEvent("https://evil.example.com/phish"));
  t("service worker: a link to another website is never opened", sw.opened[0] === "https://bay-meet.vercel.app/", JSON.stringify(sw.opened));
  sw = build();
  await sw.fire("notificationclick", clickEvent(undefined));
  t("service worker: a notification with no destination opens the home page", sw.opened[0] === "https://bay-meet.vercel.app/");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
