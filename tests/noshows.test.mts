// No-shows: "still coming?", freeing a spot, the waitlist, and telling the host. `npm run test:unit`.
import fs from "node:fs";
import path from "node:path";
import { notifyHostOfDrop, notifySpotOpened, sendDailyEmails } from "../lib/notify.ts";
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
const rec = () => { const sent: { to: string; title: string; body: string }[] = []; return { sent, push: async (to: string, p: { title: string; body: string }) => { sent.push({ to, title: p.title, body: p.body }); return { sent: 1, removed: 0, failed: 0 }; } }; };

const users = { host: { email: "host@example.com" }, ann: { email: "ann@example.com" }, bob: { email: "bob@example.com" }, cy: { email: "cy@example.com" }, dee: { email: "dee@example.com" } };
const profiles = [{ id: "host", name: "Host" }, { id: "ann", name: "Ann Lee" }, { id: "bob", name: "Bob Ray" }, { id: "cy", name: "Cy Ng" }, { id: "dee", name: "Dee Fox" }];
const NOW = new Date("2026-09-20T19:00:00Z"); // Sunday 12:00 PM Pacific

// ───────── a spot opens: the waitlist is told ─────────
const roomy = (o: Record<string, unknown> = {}): FakeData => ({
  events: [{ id: "ev1", title: "Pickup soccer", starts_at: "2026-09-26T16:00:00Z", host_id: "host", join_mode: "open", cancelled_at: null, max_spots: 4, spots_taken: 3, ...o }],
  event_waitlist: [
    { event_id: "ev1", user_id: "cy", created_at: "2026-09-19T10:00:00Z" },
    { event_id: "ev1", user_id: "bob", created_at: "2026-09-18T10:00:00Z" },
    { event_id: "ev1", user_id: "dee", created_at: "2026-09-19T12:00:00Z" },
  ],
  profiles, user_settings: [], notification_log: [],
});
const open = async (d: FakeData, now = NOW) => { const box = fakeMailbox(); const r = rec(); await silently(() => notifySpotOpened("ev1", { admin: fakeAdmin(d, users), send: box.send, push: r.push, now })); return { box, r }; };
{
  const d = roomy(); const { box, r } = await open(d);
  t("spot opened: everyone waiting gets an email and a push, oldest request first", box.sent.map((m) => m.to).join() === "bob@example.com,cy@example.com,dee@example.com" && r.sent.map((p) => p.to).join() === "bob,cy,dee", JSON.stringify(box.sent.map((m) => m.to)));
  t("spot opened: it says which meetup and that it's first come, first served", /Pickup soccer/.test(box.sent[0].subject) && /first come, first served/i.test(box.sent[0].text) && /first come/i.test(r.sent[0].body));
  const again = await open(d);
  t("spot opened: a second burst within ten minutes tells nobody again", again.box.sent.length === 0 && again.r.sent.length === 0);
  const later = await open(d, new Date(NOW.getTime() + 15 * 60000));
  t("spot opened: a later opening (another drop, ten minutes on) tells them again", later.box.sent.length === 3);
}
{
  const many = roomy(); many.event_waitlist = Array.from({ length: 9 }, (_, i) => ({ event_id: "ev1", user_id: ["bob", "cy", "dee", "ann", "host", "u6", "u7", "u8", "u9"][i], created_at: `2026-09-1${i}T10:00:00Z` }));
  const x = await open(many);
  t("spot opened: at most five people are told at a time (a spot or two opened, not nine)", x.r.sent.length <= 5);
  t("spot opened: nothing if the meetup is still full", (await open(roomy({ spots_taken: 4 }))).box.sent.length === 0);
  t("spot opened: nothing for an approval-only meetup (there's no waitlist; the host decides)", (await open(roomy({ join_mode: "request" }))).box.sent.length === 0);
  t("spot opened: nothing for a cancelled meetup", (await open(roomy({ cancelled_at: "2026-09-21T00:00:00Z" }))).box.sent.length === 0);
  t("spot opened: nothing once it has started", (await open(roomy(), new Date("2026-09-26T17:00:00Z"))).box.sent.length === 0);
  const none = roomy(); none.event_waitlist = [];
  t("spot opened: nothing if nobody is waiting", (await open(none)).box.sent.length === 0);
  const quietD = roomy(); quietD.user_settings = [{ user_id: "bob", quiet_start: 8, quiet_end: 14, notify_reminders: false, notify_matches: false, notify_activity: false }];
  const q = await open(quietD);
  t("spot opened: it's critical news: it reaches someone in quiet hours with every kind switched off", q.r.sent.some((p) => p.to === "bob") && q.box.sent.some((m) => m.to === "bob@example.com"));
  const emailOff = roomy(); emailOff.user_settings = [{ user_id: "bob", email_notifications: false }];
  const e = await open(emailOff);
  t("spot opened: with the master email switch off, just the push", !e.box.sent.some((m) => m.to === "bob@example.com") && e.r.sent.some((p) => p.to === "bob"));
  let threw = false; try { await silently(() => notifySpotOpened("ev1", { admin: null })); } catch { threw = true; }
  t("spot opened: with no server key it quietly does nothing", !threw);
}

// ───────── a late drop: the host hears ─────────
const drop = async (d: FakeData, now = NOW, guest = "ann") => { const box = fakeMailbox(); const r = rec(); await silently(() => notifyHostOfDrop("ev1", guest, { admin: fakeAdmin(d, users), send: box.send, push: r.push, now })); return { box, r }; };
{
  const d = roomy({ starts_at: "2026-09-21T19:00:00Z", spots_taken: 2 }); // tomorrow noon: 24 hours away
  const { box, r } = await drop(d);
  t("late drop: within two days of the start, the host gets an email and a push", box.sent.length === 1 && box.sent[0].to === "host@example.com" && r.sent.length === 1 && r.sent[0].to === "host", JSON.stringify(box.sent.map((m) => m.to)));
  t("late drop: it names the guest and how many spots are open", /Ann/.test(box.sent[0].subject) && /2 spots are open/.test(box.sent[0].text), box.sent[0].text);
  t("late drop: the same drop is only reported once", (await drop(d)).box.sent.length === 0);
  t("late drop: a drop more than two days ahead isn't worth a ping", (await drop(roomy({ starts_at: "2026-09-26T19:00:00Z" }))).box.sent.length === 0);
  t("late drop: nothing once it has started or for a cancelled meetup", (await drop(roomy({ starts_at: "2026-09-21T19:00:00Z" }), new Date("2026-09-21T20:00:00Z"))).box.sent.length === 0 && (await drop(roomy({ starts_at: "2026-09-21T19:00:00Z", cancelled_at: "2026-09-20T00:00:00Z" }))).box.sent.length === 0);
  t("late drop: the host leaving their own meetup doesn't ping the host", (await drop(roomy({ starts_at: "2026-09-21T19:00:00Z" }), NOW, "host")).box.sent.length === 0);
  const off = roomy({ starts_at: "2026-09-21T19:00:00Z" }); off.user_settings = [{ user_id: "host", notify_activity: false }];
  t("late drop: a host who switched 'Activity' off isn't pinged", (await drop(off)).box.sent.length === 0);
  const capped = roomy({ starts_at: "2026-09-21T19:00:00Z" }); capped.notification_log = [1, 2, 3].map((i) => ({ user_id: "host", kind: "digest", ref: `r${i}`, created_at: new Date(NOW.getTime() - 3600000).toISOString() }));
  const c = await drop(capped);
  t("late drop: past the daily nudge limit the email still goes, but no extra push", c.box.sent.length === 1 && c.r.sent.length === 0);
}

// ───────── "still coming?" the day of ─────────
const TODAY9 = new Date("2026-09-20T16:00:00Z"); // Sunday 9:00 AM Pacific, when the daily job runs
const dayData = (o: Record<string, unknown> = {}): FakeData => ({
  events: [{ id: "ev1", title: "Evening run", starts_at: "2026-09-21T01:30:00Z", host_id: "host", join_mode: "open", venue_name: "Park", address: "1 Main", cancelled_at: null, max_spots: 8, spots_taken: 4, ...o }], // 6:30 PM today
  rsvps: [
    { event_id: "ev1", user_id: "host", status: "approved", confirmed_at: null },
    { event_id: "ev1", user_id: "ann", status: "approved", confirmed_at: null },
    { event_id: "ev1", user_id: "bob", status: "approved", confirmed_at: "2026-09-20T15:00:00Z" },
    { event_id: "ev1", user_id: "cy", status: "pending", confirmed_at: null },
  ],
  profiles, user_settings: [], notification_log: [],
});
const daily = async (d: FakeData, opts: Record<string, unknown> = {}, now = TODAY9) => { const box = fakeMailbox(); const r = rec(); const res = await silently(() => sendDailyEmails(now, { admin: fakeAdmin(d, users, opts), send: box.send, push: r.push })); return { res, box, r }; };
{
  const d = dayData(); const { res, box, r } = await daily(d);
  const still = box.sent.filter((m) => /Still coming/.test(m.subject));
  t("still coming: an unconfirmed guest of a meetup later today is asked, by email and push", still.length === 1 && still[0].to === "ann@example.com" && r.sent.some((p) => p.to === "ann" && /Still coming/.test(p.title)) && res.stillComing === 1, JSON.stringify({ s: still.map((m) => m.to), n: res.stillComing }));
  t("still coming: not the host, not someone who already confirmed, not someone whose request is pending", !still.some((m) => ["host@example.com", "bob@example.com", "cy@example.com"].includes(m.to)));
  t("still coming: the email says when it starts and offers to free the spot", /6:30 PM/.test(still[0].text) && /free/i.test(still[0].text));
  t("still coming: it's recorded, so running the job again sends nothing more", d.notification_log.some((x) => x.kind === "still_coming" && x.ref === "ev1" && x.user_id === "ann"));
  const again = await daily(d);
  t("still coming: running the daily job twice never asks the same person twice", again.box.sent.filter((m) => /Still coming/.test(m.subject)).length === 0 && again.res.stillComing === 0);
}
{
  t("still coming: a meetup less than two hours away is left alone (too late to act on)", (await daily(dayData({ starts_at: "2026-09-20T17:30:00Z" }))).res.stillComing === 0);
  t("still coming: tomorrow's meetups aren't asked yet (they get the day-before reminder)", (await daily(dayData({ starts_at: "2026-09-21T20:00:00Z" }))).res.stillComing === 0);
  t("still coming: a cancelled meetup isn't asked about", (await daily(dayData({ cancelled_at: "2026-09-19T00:00:00Z" }))).res.stillComing === 0);
  const off = dayData(); off.user_settings = [{ user_id: "ann", notify_reminders: false }];
  const o = await daily(off);
  t("still coming: someone who switched Reminders off isn't asked (and it's counted)", o.res.stillComing === 0 && o.res.mutedByPrefs >= 1 && !o.box.sent.some((m) => /Still coming/.test(m.subject)));
  const quietD = dayData(); quietD.user_settings = [{ user_id: "ann", quiet_start: 8, quiet_end: 10 }];
  const q = await daily(quietD);
  t("still coming: in quiet hours the email still goes; the push waits", q.box.sent.some((m) => /Still coming/.test(m.subject)) && !q.r.sent.some((p) => /Still coming/.test(p.title)));
  const noCol = await daily(dayData(), { noConfirmColumn: true });
  t("still coming: before the database update it does nothing at all (rather than asking everyone)", noCol.res.stillComing === 0 && !noCol.box.sent.some((m) => /Still coming/.test(m.subject)));
  const noLog = await daily(dayData(), { logError: true });
  t("still coming: if the send log is unavailable, nobody is asked (fails safe)", noLog.res.stillComing === 0 && !noLog.box.sent.some((m) => /Still coming/.test(m.subject)));
}

// ───────── the doors ─────────
{
  const actions = read("app/actions.ts");
  const conf = actions.slice(actions.indexOf("export async function confirmAttendance"), actions.indexOf("export async function joinWaitlist"));
  t("confirm: needs a login and goes only through the database function that checks you're going", /getUser\(\)/.test(conf) && /\.rpc\("confirm_attendance"/.test(conf) && /PGRST202/.test(conf));
  const wl = actions.slice(actions.indexOf("export async function joinWaitlist"), actions.indexOf("export async function deleteEvent"));
  t("waitlist: joining and leaving need a login and only ever touch the caller's own row", (wl.match(/getUser\(\)/g) ?? []).length === 2 && /insert\(\{ event_id: eventId, user_id: user\.id \}\)/.test(wl) && /\.eq\("user_id", user\.id\)/.test(wl));
  t("waitlist: a missing table gives a plain message and a log line, never a crash", /PGRST205|42P01/.test(wl) && /019_retention_features/.test(wl));
  const set = actions.slice(actions.indexOf("export async function setRsvp"), actions.indexOf("/** \"Still coming?\""));
  const leave = set.slice(set.indexOf("// If they held a spot"));
  t("leaving: it notes whether they held a spot BEFORE deleting, and only then offers the spot on and tells the host", leave.indexOf('select("status")') > -1 && leave.indexOf('select("status")') < leave.indexOf(".delete()") && leave.indexOf(".delete()") < leave.indexOf("notifySpotOpened") && /mine\?\.status === "approved"[\s\S]{0,200}notifySpotOpened\(eventId\)[\s\S]{0,80}notifyHostOfDrop\(eventId, user\.id\)/.test(leave), leave.slice(0, 200));
  t("editing: adding spots (only an increase, only if the spots saved) tells the waitlist", /spotsChanged && !spotsProblem && maxSpots > event\.max_spots\) waitUntil\(notifySpotOpened\(eventId\)\)/.test(actions));
  const panel = read("components/RsvpPanel.tsx");
  t("full meetups: an open one offers 'Tell me if a spot opens' to a logged-in guest, but not to the host, not for approval-only, and only where waitlists exist", /full && waitlist && loggedIn && !isRequest && !isHost/.test(panel) && /Tell me if a spot opens/.test(panel));
  t("waitlist button: it flips at once and undoes itself if the server refuses", /setWaiting\(next\)/.test(panel) && /setWaiting\(!next\)/.test(panel));
  const page = read("app/events/[id]/page.tsx");
  t("meetup page: 'still coming?' is only for a going guest (never the host), within 30 hours of the start, and only once the database update is in", /confirmedAt !== undefined && !isHost && myStatus === "approved" && !cancelled && !ended && new Date\(event\.starts_at\)\.getTime\(\) - Date\.now\(\) <= 30 \* 3600 \* 1000/.test(page));
  t("meetup page: the waitlist and confirmation reads are best-effort (errors ignored, so nothing breaks before the update)", /if \(!mineError\)/.test(page) && /if \(!errW\)/.test(page) && /if \(!errC\)/.test(page));
  t("meetup page: the host is told how many are waiting, and that adding spots tells them", /waiting=\{waitingCount\}/.test(page) && /Adding spots with/.test(read("components/ManageEvent.tsx")));
  const card = read("components/StillComing.tsx");
  t("still-coming card: 'Yes' confirms, 'I can't make it' asks first and then frees the spot through the normal leave", /confirmAttendance\(eventId\)/.test(card) && /window\.confirm\("Free your spot\?/.test(card) && /setRsvp\(eventId, false\)/.test(card));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
