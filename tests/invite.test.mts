// Bring a friend: signed invite links, who is told, and the doors. `npm run test:unit`.
import fs from "node:fs";
import path from "node:path";
import { signInvite, verifyInvite } from "../lib/invite.ts";
import { notifyFriendJoined } from "../lib/notify.ts";
import { fakeAdmin, fakeMailbox, type FakeData } from "./fake-supabase.mts";

let passed = 0;
let failed = 0;
const t = (name: string, cond: boolean, extra = "") => {
  cond ? passed++ : failed++;
  console.log(`${cond ? "ok   " : "FAIL "}${name}${cond ? "" : "  -> " + extra}`);
};
const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");
const quiet = console.log;
const silently = async <T,>(fn: () => Promise<T>) => {
  console.log = () => {};
  try { return await fn(); } finally { console.log = quiet; }
};

const EV = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", EV2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ANN = "11111111-1111-4111-8111-111111111111", BOB = "22222222-2222-4222-8222-222222222222";
const saved = { i: process.env.INVITE_SECRET, s: process.env.SUPABASE_SERVICE_ROLE_KEY };
const withKeys = (invite: string | undefined, service: string | undefined, fn: () => void) => {
  if (invite === undefined) delete process.env.INVITE_SECRET; else process.env.INVITE_SECRET = invite;
  if (service === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = service;
  try { fn(); } finally { if (saved.i === undefined) delete process.env.INVITE_SECRET; else process.env.INVITE_SECRET = saved.i; if (saved.s === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = saved.s; }
};

// ───────── the token ─────────
withKeys(undefined, "service-key-one", () => {
  const tok = signInvite(EV, ANN)!;
  t("invite: a token is made for a meetup and an inviter", typeof tok === "string" && tok.startsWith(`${ANN}.`) && /^[0-9a-f-]{36}\.[0-9a-f]{24}$/.test(tok), tok);
  t("invite: it verifies, and names the inviter", verifyInvite(EV, tok) === ANN);
  t("invite: it works the same with an upper-case id (ids are normalised)", verifyInvite(EV, signInvite(EV, ANN.toUpperCase())!) === ANN);
  t("invite: the same inputs always give the same token", signInvite(EV, ANN) === signInvite(EV, ANN));
  t("invite: it can't be reused on a different meetup", verifyInvite(EV2, tok) === null);
  t("invite: it can't be edited to name someone else (the signature covers the inviter)", verifyInvite(EV, tok.replace(ANN, BOB)) === null);
  t("invite: a different person or meetup gives a different token", signInvite(EV, BOB) !== tok && signInvite(EV2, ANN) !== tok);
  const sig = tok.split(".")[1];
  const flipped = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0");
  t("invite: a single changed character in the signature is refused", verifyInvite(EV, `${ANN}.${flipped}`) === null);
  t("invite: the token doesn't contain the secret", !tok.includes("service-key-one") && !tok.includes("sofly-invite"));
  const junk: unknown[] = [undefined, null, 5, {}, [], "", ".", "..", "abc", `${ANN}`, `${ANN}.`, `.${sig}`, `${ANN}.${sig}.extra`, `${ANN}.zzzz`, `${ANN}.${sig.toUpperCase()}`, `${ANN}.${"a".repeat(23)}`, `${ANN}.${"a".repeat(25)}`, "x".repeat(500), `not-a-uuid.${sig}`, `${ANN}\n.${sig}`, `${ANN}.${sig}\u0000`];
  let threw = false; let accepted = 0;
  try { for (const j of junk) if (verifyInvite(EV, j) !== null) accepted++; } catch { threw = true; }
  t("invite: malformed, oversized or hostile input is refused and never crashes", !threw && accepted === 0, String(accepted));
  t("invite: a made-up meetup id or inviter id can't be signed or verified", signInvite("nope", ANN) === null && signInvite(EV, "nope") === null && verifyInvite("nope", tok) === null);
});
withKeys(undefined, "service-key-two", () => {
  const other = signInvite(EV, ANN)!;
  withKeys(undefined, "service-key-one", () => t("invite: a token made under a different server key doesn't verify (so old links die if the key changes)", verifyInvite(EV, other) === null));
});
let explicitToken = "";
let explicitWorks = false;
withKeys("explicit-secret", "service-key-one", () => {
  explicitToken = signInvite(EV, ANN)!;
  explicitWorks = verifyInvite(EV, explicitToken) === ANN;
});
withKeys(undefined, "service-key-one", () => t("invite: INVITE_SECRET takes priority over the derived key (a token made with it doesn't verify without it)", verifyInvite(EV, explicitToken) === null));
t("invite: ...and it verifies when the secret is set", explicitWorks);
withKeys(undefined, undefined, () => {
  t("invite: with no secret at all, invites are simply off (nothing is signed, nothing verifies)", signInvite(EV, ANN) === null && verifyInvite(EV, `${ANN}.${"a".repeat(24)}`) === null);
});
{
  const src = read("lib/invite.ts");
  t("invite: signatures are compared in constant time, and use HMAC-SHA256", /timingSafeEqual/.test(src) && /createHmac\("sha256"/.test(src));
  t("invite: the key comes from settings, never from the code", !/["'`][A-Za-z0-9+/=]{30,}["'`]/.test(src.replace(/\/\/.*$/gm, "")));
}

// ───────── telling the friend's inviter ─────────
const NOW = new Date("2026-09-20T19:00:00Z");
const users = { host: { email: "host@example.com" }, ann: { email: "ann@example.com" }, bob: { email: "bob@example.com" } };
const base = (): FakeData => ({
  events: [{ id: "ev1", title: "Pickup soccer", starts_at: "2026-09-26T16:00:00Z", host_id: "host", join_mode: "open", cancelled_at: null }],
  rsvps: [{ event_id: "ev1", user_id: "ann", status: "approved" }, { event_id: "ev1", user_id: "bob", status: "approved", invited_by: "ann" }],
  profiles: [{ id: "host", name: "Host" }, { id: "ann", name: "Ann Lee" }, { id: "bob", name: "Bob Ray" }],
  user_settings: [],
  notification_log: [],
});
const rec = () => { const sent: { to: string; title: string; body: string }[] = []; return { sent, push: async (to: string, p: { title: string; body: string }) => { sent.push({ to, title: p.title, body: p.body }); return { sent: 1, removed: 0, failed: 0 }; } }; };
const run = async (d: FakeData, friend = "bob", now = NOW) => { const box = fakeMailbox(); const r = rec(); await silently(() => notifyFriendJoined("ev1", friend, { admin: fakeAdmin(d, users), send: box.send, push: r.push, now })); return { box, r }; };
{
  const d = base(); const { box, r } = await run(d);
  t("friend joined: the person who invited them gets an email and a push", box.sent.length === 1 && box.sent[0].to === "ann@example.com" && r.sent.length === 1 && r.sent[0].to === "ann", JSON.stringify({ m: box.sent.map((m) => m.to), p: r.sent }));
  t("friend joined: they're named, and the meetup", /Bob/.test(box.sent[0].subject) && /Pickup soccer/.test(box.sent[0].subject) && /Bob is coming/.test(r.sent[0].title) && /Pickup soccer/.test(r.sent[0].body));
  t("friend joined: it's recorded as a nudge, once per friend and meetup", d.notification_log.length === 1 && d.notification_log[0].kind === "friend_joined" && d.notification_log[0].ref === "ev1:bob");
  const again = await run(d);
  t("friend joined: telling them twice is impossible (a retry or a double-tap sends nothing more)", again.box.sent.length === 0 && again.r.sent.length === 0);
}
{
  const d = base(); d.rsvps[1] = { event_id: "ev1", user_id: "bob", status: "pending", invited_by: "ann" };
  const x = await run(d);
  t("friend joined: nothing while the friend's request is still pending (it waits for the host's yes)", x.box.sent.length === 0 && d.notification_log.length === 0);
  const d2 = base(); d2.rsvps[1] = { event_id: "ev1", user_id: "bob", status: "declined", invited_by: "ann" };
  t("friend joined: nothing if the host declined them", (await run(d2)).box.sent.length === 0);
}
{
  const d = base(); (d.rsvps[1] as { invited_by: unknown }).invited_by = null;
  t("friend joined: nobody to tell when they came on their own", (await run(d)).box.sent.length === 0);
  const d2 = base(); (d2.rsvps[1] as { invited_by: unknown }).invited_by = "bob";
  t("friend joined: never tells someone about themselves", (await run(d2)).box.sent.length === 0);
  const d3 = base(); (d3.events[0] as { cancelled_at: unknown }).cancelled_at = "2026-09-21T00:00:00Z";
  t("friend joined: nothing for a cancelled meetup", (await run(d3)).box.sent.length === 0);
  t("friend joined: nothing for a meetup that already started", (await run(base(), "bob", new Date("2026-09-26T17:00:00Z"))).box.sent.length === 0);
  t("friend joined: an unknown person or meetup does nothing and doesn't crash", (await run(base(), "nobody")).box.sent.length === 0);
}
{
  const d = base(); d.user_settings = [{ user_id: "ann", notify_activity: false }];
  const x = await run(d);
  t("friend joined: someone who switched 'Activity on my meetups' off hears nothing", x.box.sent.length === 0 && x.r.sent.length === 0);
  const d2 = base(); d2.user_settings = [{ user_id: "ann", quiet_start: 8, quiet_end: 14 }]; // 12:00 PM Pacific is inside it
  const y = await run(d2);
  t("friend joined: in their quiet hours the email goes, the push waits", y.box.sent.length === 1 && y.r.sent.length === 0);
  const d3 = base(); d3.notification_log = [1, 2, 3].map((i) => ({ user_id: "ann", kind: "digest", ref: `r${i}`, created_at: new Date(NOW.getTime() - 3600000).toISOString() }));
  const z = await run(d3);
  t("friend joined: past the daily nudge limit the email still goes, but not another push", z.box.sent.length === 1 && z.r.sent.length === 0);
  const d4 = base(); d4.user_settings = [{ user_id: "ann", email_notifications: false }];
  const w = await run(d4);
  t("friend joined: with the master email switch off, just the push", w.box.sent.length === 0 && w.r.sent.length === 1);
}
{
  const box = fakeMailbox(); let threw = false;
  try { await silently(() => notifyFriendJoined("ev1", "bob", { admin: null })); } catch { threw = true; }
  t("friend joined: with no server key it quietly does nothing", !threw && box.sent.length === 0);
}

// ───────── the doors ─────────
{
  const actions = read("app/actions.ts");
  const set = actions.slice(actions.indexOf("export async function setRsvp"), actions.indexOf("export async function deleteEvent"));
  t("joining: an invite is checked with the signature for THIS meetup, and never trusted from the browser directly", /verifyInvite\(eventId, invite\)/.test(set) && /inviterId !== user\.id/.test(set));
  t("joining: the normal join is untouched (no invite column) so it works before the database update", /: await supabase\.from\("rsvps"\)\.insert\(\{ event_id: eventId, user_id: user\.id \}\)/.test(set));
  t("joining: if the invite column isn't there yet, they still join (without the invite being recorded)", /PGRST204/.test(set) && /42703/.test(set) && /join without recording who invited them/.test(set));
  t("joining: the inviter is told for open meetups straight away, and for approval-only ones when the host approves", /invitedBy && !isRequest\) waitUntil\(notifyFriendJoined/.test(set) && /if \(decision === "approve"\) waitUntil\(notifyFriendJoined\(eventId, userId\)\)/.test(actions));
  const page = read("app/events/[id]/page.tsx");
  t("meetup page: the 'invited you' note needs a genuine link, someone who isn't the host, and someone who hasn't joined", /inviterName && !isHost && !myStatus && !cancelled && !ended/.test(page) && /verifyInvite\(event\.id, inviteToken\)/.test(page));
  t("meetup page: the invite is only passed on to joining when it verified", /invite=\{inviterName \? inviteToken : undefined\}/.test(page));
  t("meetup page: the share card is for people who are going (or hosting), only while there's room, and only if invites are set up", /\(isHost \|\| myStatus === "approved"\) && !cancelled && !ended && event\.spots_taken < event\.max_spots/.test(page) && /signInvite\(event\.id, user\.id\)/.test(page) && /token \? \(/.test(page));
  t("meetup page: 'who invited whom' is read only for the host, and quietly skipped if the database doesn't have it yet", /if \(isHost\) \{\s*\n\s*const \{ data: invited, error: invitedError \}/.test(page) && /!invitedError/.test(page));
  t("meetup page: the share text has the date and neighborhood, never the address", /Come with me!/.test(page) && !/\$\{address\}|\$\{venue\}/.test(page.slice(page.indexOf("<BringAFriend"), page.indexOf("<BringAFriend") + 500)));
  t("logging in keeps the invite (the link goes through login and back)", /encodeURIComponent\(invite \? `\/events\/\$\{eventId\}\?ref=\$\{invite\}`/.test(read("components/RsvpPanel.tsx")));
  const card = read("components/BringAFriend.tsx");
  t("share card: uses the phone's share sheet, ignores 'closed it', falls back to copying the link", /navigator\.share/.test(card) && /AbortError/.test(card) && /clipboard\.writeText/.test(card));
  t("share card: for approval-only meetups it says the friend still asks and the host decides", /the host decides/.test(card) && /approvalOnly/.test(card));
  t("host chips: 'Invited by <first name>' appears next to requests and guests", /Invited by \{r\.invitedBy\}/.test(read("components/RequestsPanel.tsx")) && /Invited by \{g\.invitedBy\}/.test(read("components/GuestProfiles.tsx")));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
