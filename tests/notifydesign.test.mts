// Notification design: kinds, quiet hours, frequency limits, the weekly digest, and the prompt.
// Real logic against a fake database and inbox. `npm run test:unit`.
import fs from "node:fs";
import path from "node:path";
import { rankMeetups, scoreMeetup, whyThis, type Candidate } from "../lib/engagement.ts";
import { claimSend, digestSentRecently, nudgesToday, underNudgeCap } from "../lib/notify-log.ts";
import { DEFAULT_PREFS, NUDGE_PUSH_CAP_PER_DAY, QUIET_PRESETS, channelsFor, inQuietHours, parsePrefs, type Prefs } from "../lib/notify-policy.ts";
import { loadPrefs, notifyEventCancelled, notifyHostOfRequest, notifyRequestDecision, sendDailyEmails } from "../lib/notify.ts";
import { pacificWeekday } from "../lib/time.ts";
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

// ───────── the rules ─────────
const at = (iso: string) => new Date(iso);
{
  t("prefs: no row means everything on, no quiet hours", JSON.stringify(parsePrefs(null)) === JSON.stringify(DEFAULT_PREFS) && JSON.stringify(parsePrefs(undefined)) === JSON.stringify(DEFAULT_PREFS));
  t("prefs: only an explicit false switches something off", parsePrefs({ notify_matches: false }).matches === false && parsePrefs({ notify_matches: null }).matches === true && parsePrefs({ notify_matches: 0 }).matches === true && parsePrefs({ email_notifications: false }).email === false);
  t("prefs: the old table (only the email switch) still works", parsePrefs({ email_notifications: false }).reminders === true && parsePrefs({ email_notifications: true }).email === true);
  t("prefs: quiet hours need both ends and real hours, otherwise there are none", parsePrefs({ quiet_start: 22, quiet_end: null }).quietStart === null && parsePrefs({ quiet_start: 25, quiet_end: 8 }).quietStart === null && parsePrefs({ quiet_start: 22.5, quiet_end: 8 }).quietStart === null && parsePrefs({ quiet_start: 22, quiet_end: 8 }).quietEnd === 8);
  const night: Prefs = { ...DEFAULT_PREFS, quietStart: 22, quietEnd: 8 };
  // Pacific summer time is UTC-7: 22:00 PDT = 05:00Z next day
  t("quiet hours: 10 PM to 8 AM covers midnight (11 PM, 3 AM, 7:59 AM are quiet; 8 AM, noon, 9:59 PM are not)", ["2026-09-21T06:00:00Z", "2026-09-21T10:00:00Z", "2026-09-21T14:59:00Z"].every((x) => inQuietHours(night, at(x))) && ["2026-09-21T15:00:00Z", "2026-09-20T19:00:00Z", "2026-09-21T04:59:00Z"].every((x) => !inQuietHours(night, at(x))));
  const day: Prefs = { ...DEFAULT_PREFS, quietStart: 13, quietEnd: 15 };
  t("quiet hours: a daytime window works too (1 PM to 3 PM)", inQuietHours(day, at("2026-09-20T20:30:00Z")) && !inQuietHours(day, at("2026-09-20T19:59:00Z")) && !inQuietHours(day, at("2026-09-20T22:00:00Z")));
  t("quiet hours: none set, or the same hour twice, means never quiet", !inQuietHours(DEFAULT_PREFS, at("2026-09-21T10:00:00Z")) && !inQuietHours({ ...DEFAULT_PREFS, quietStart: 9, quietEnd: 9 }, at("2026-09-21T16:00:00Z")));
  t("quiet hours: read in Pacific time in winter too (UTC-8)", inQuietHours(night, at("2027-01-15T07:00:00Z")) && !inQuietHours(night, at("2027-01-15T16:30:00Z")));
  const noon = at("2026-09-20T19:00:00Z"), midnight = at("2026-09-21T07:00:00Z");
  t("channels: with defaults, every kind uses email and push", (["reminders", "matches", "activity", "critical"] as const).every((c) => { const x = channelsFor(DEFAULT_PREFS, c, noon); return x.email && x.push; }));
  t("channels: switching a kind off silences both email and push for that kind only", (() => { const p = { ...DEFAULT_PREFS, matches: false }; return !channelsFor(p, "matches", noon).email && !channelsFor(p, "matches", noon).push && channelsFor(p, "reminders", noon).email && channelsFor(p, "activity", noon).push; })());
  t("channels: quiet hours hold back push for reminders, matches and activity, but never email", (["reminders", "matches", "activity"] as const).every((c) => { const x = channelsFor(night, c, midnight); return x.email && !x.push; }));
  t("channels: critical news (answers, cancellations, changes) ignores quiet hours and the kind switches", (() => { const p = { ...night, reminders: false, matches: false, activity: false }; const x = channelsFor(p, "critical", midnight); return x.email && x.push; })());
  t("channels: the master email switch turns off email for everything, including critical, but not push", (() => { const p = { ...DEFAULT_PREFS, email: false }; return (["reminders", "matches", "activity", "critical"] as const).every((c) => !channelsFor(p, c, noon).email) && channelsFor(p, "critical", noon).push; })());
  t("presets: quiet-hour choices are real windows", QUIET_PRESETS[0].start === null && QUIET_PRESETS.slice(1).every((p) => p.start !== null && p.end !== null && p.start !== p.end) && QUIET_PRESETS.length >= 3);
  t("weekday: Thursday morning in Pacific time is a Thursday (even though it's already Friday in UTC late at night)", pacificWeekday(at("2026-09-24T16:00:00Z")) === 4 && pacificWeekday(at("2026-09-25T05:00:00Z")) === 4 && pacificWeekday(at("2026-09-25T08:00:00Z")) === 5);
}

// ───────── meetup ranking ─────────
const NOW = at("2026-09-20T19:51:45Z"); // Sunday 12:51 PM Pacific
{
  const c = (id: string, o: Partial<Candidate> = {}): Candidate => ({ id, title: id, category: "Yoga", neighborhood: "Berkeley", starts_at: "2026-09-23T02:00:00Z", spots_left: 5, audience: "Everyone", age_min: null, age_max: null, host_id: "h", series_id: null, ...o });
  const taste = { categories: ["Running"], neighborhoods: ["Oakland"] };
  const run = (list: Candidate[], o: Partial<Parameters<typeof rankMeetups>[2]> = {}) => rankMeetups(list, taste, { now: NOW, withinDays: 10, limit: 4, ...o }).map((x) => x.id);
  t("ranking: a meetup in a category you like beats one that isn't, whatever the date", run([c("other", { starts_at: "2026-09-21T02:00:00Z" }), c("run", { category: "Running", starts_at: "2026-09-29T02:00:00Z" })])[0] === "run");
  t("ranking: your neighborhood counts, but less than what you like", run([c("near", { neighborhood: "Oakland" }), c("cat", { category: "Running", neighborhood: "SF - Mission" }), c("none")]).join() === "cat,near,none");
  t("ranking: ties go to the sooner meetup, then by id (the same input always gives the same list)", run([c("b", { starts_at: "2026-09-24T02:00:00Z" }), c("a", { starts_at: "2026-09-24T02:00:00Z" }), c("early", { starts_at: "2026-09-23T02:00:00Z" })]).join() === "early,a,b");
  t("ranking: full meetups are never suggested", run([c("full", { spots_left: 0 }), c("ok")]).join() === "ok");
  t("ranking: nor women-only or men-only ones (we don't know anyone's gender)", run([c("w", { audience: "Women-only" }), c("m", { audience: "Men-only" }), c("ok")]).join() === "ok");
  t("ranking: nor anything already joined or hosted", run([c("mine"), c("ok")], { exclude: new Set(["mine"]) }).join() === "ok");
  t("ranking: nor anything past, right now, or beyond the window", run([c("past", { starts_at: "2026-09-19T02:00:00Z" }), c("now", { starts_at: NOW.toISOString() }), c("far", { starts_at: "2026-10-05T02:00:00Z" }), c("ok")]).join() === "ok");
  t("ranking: an age-limited meetup is left out if you're outside it (or if you're within, kept)", run([c("thirty", { age_min: 30 }), c("ok")], { birthDate: "2000-01-01" }).join() === "ok" && run([c("thirty", { age_min: 30 })], { birthDate: "1990-01-01" }).join() === "thirty" && run([c("thirty", { age_min: 30 })]).join() === "thirty");
  t("ranking: a weekly series is suggested once (its next date)", run([c("s1", { series_id: "S", starts_at: "2026-09-23T02:00:00Z" }), c("s2", { series_id: "S", starts_at: "2026-09-30T02:00:00Z" }), c("solo")]).join() === "s1,solo");
  t("ranking: it returns at most the limit, and nothing for a limit of 0 or an empty list", run([c("a"), c("b"), c("c")], { limit: 2 }).length === 2 && run([c("a")], { limit: 0 }).length === 0 && run([]).length === 0);
  t("ranking: filling up honestly raises the score a little", scoreMeetup(c("x", { spots_left: 2 }), taste, NOW, 10) > scoreMeetup(c("x", { spots_left: 6 }), taste, NOW, 10));
  t("ranking: the reason given is honest (interest, then place, then spots, then timing)", whyThis(c("x", { category: "Running" }), taste) === "You like Running" && whyThis(c("x", { neighborhood: "Oakland" }), taste) === "Near you in Oakland" && whyThis(c("x", { spots_left: 1 }), taste) === "1 spot left" && whyThis(c("x"), taste) === "Happening soon");
  const before = JSON.stringify([c("a"), c("b")]); const list = [c("a"), c("b")]; rankMeetups(list, taste, { now: NOW, withinDays: 10, limit: 4 });
  t("ranking: the input list isn't changed", JSON.stringify(list) === before);
}

// ───────── the send log ─────────
{
  const d: FakeData = { notification_log: [] };
  const admin = fakeAdmin(d, {});
  t("log: a message can be claimed once; the second try is refused (so a rerun never repeats itself)", (await claimSend(admin, "ann", "digest", "2026-09-24")) === true && (await claimSend(admin, "ann", "digest", "2026-09-24")) === false);
  t("log: a different person, kind or week is a different message", (await claimSend(admin, "bob", "digest", "2026-09-24")) && (await claimSend(admin, "ann", "still_coming", "2026-09-24")) && (await claimSend(admin, "ann", "digest", "2026-10-01")));
  const broken = fakeAdmin({}, {}, { logError: true });
  const errs: unknown[] = []; const orig = console.error; console.error = (...a: unknown[]) => errs.push(a);
  t("log: if the log table is missing, nothing is claimed (better to send nothing than to send again and again), and the reason is logged", (await claimSend(broken, "ann", "digest", "x")) === false && errs.length === 1 && /019_retention_features/.test(String((errs[0] as unknown[])[0])));
  console.error = orig;
  const many: FakeData = { notification_log: [] };
  const a2 = fakeAdmin(many, {});
  for (let i = 0; i < NUDGE_PUSH_CAP_PER_DAY; i++) await claimSend(a2, "ann", i === 0 ? "digest" : "friend_joined", `r${i}`);
  await claimSend(a2, "ann", "reminder_not_a_nudge", "r9");
  t(`log: nudges are counted per person over the last day, and stop at ${NUDGE_PUSH_CAP_PER_DAY}`, (await nudgesToday(a2, "ann", new Date())) === NUDGE_PUSH_CAP_PER_DAY && !(await underNudgeCap(a2, "ann", new Date())) && (await underNudgeCap(a2, "bob", new Date())));
  t("log: only nudges count (other kinds of message don't use up the allowance)", (await nudgesToday(fakeAdmin({ notification_log: [{ user_id: "ann", kind: "other", ref: "1", created_at: new Date().toISOString() }] }, {}), "ann")) === 0);
  t("log: an old nudge doesn't count", (await nudgesToday(fakeAdmin({ notification_log: [{ user_id: "ann", kind: "digest", ref: "old", created_at: "2026-01-01T00:00:00Z" }] }, {}), "ann", new Date("2026-09-20T00:00:00Z"))) === 0);
  t("log: a digest in the last 6 days blocks another; one 7 days ago doesn't", (await digestSentRecently(fakeAdmin({ notification_log: [{ user_id: "ann", kind: "digest", ref: "w", created_at: "2026-09-19T00:00:00Z" }] }, {}), "ann", new Date("2026-09-24T16:00:00Z"))) && !(await digestSentRecently(fakeAdmin({ notification_log: [{ user_id: "ann", kind: "digest", ref: "w", created_at: "2026-09-17T00:00:00Z" }] }, {}), "ann", new Date("2026-09-24T16:00:00Z"))));
  t("log: if it can't be read, we assume a digest was sent (when in doubt, don't send another)", (await digestSentRecently(broken, "ann")) === true && (await nudgesToday(broken, "ann")) === 0);
}

// ───────── the sends respect the settings ─────────
const users = { host: { email: "host@example.com" }, ann: { email: "ann@example.com" }, bob: { email: "bob@example.com" }, cy: { email: "cy@example.com" } };
const base = (): FakeData => ({
  events: [{ id: "ev1", title: "Pickeball", starts_at: "2026-09-22T00:00:00+00:00", host_id: "host", join_mode: "request", venue_name: "Shared after approval", address: "Oakland", cancelled_at: null, category: "Pickleball", neighborhood: "Oakland", max_spots: 8, spots_taken: 2, audience: "Everyone", age_min: null, age_max: null, series_id: null }],
  event_locations: [{ event_id: "ev1", venue_name: "Court 3", address: "1 Main St, Oakland, CA" }],
  rsvps: [{ event_id: "ev1", user_id: "host", status: "approved" }, { event_id: "ev1", user_id: "ann", status: "approved" }],
  profiles: [{ id: "host", name: "David Madriz" }, { id: "ann", name: "Ann Lee" }, { id: "bob", name: "Bob Ray" }, { id: "cy", name: "Cy Ng" }],
  user_settings: [],
  notification_log: [],
});
const recorder = () => { const sent: { to: string; title: string }[] = []; return { sent, push: async (to: string, p: { title: string }) => { sent.push({ to, title: p.title }); return { sent: 1, removed: 0, failed: 0 }; } }; };
const MIDNIGHT = at("2026-09-21T07:00:00Z"); // 12:00 AM Pacific
{
  const run = async (settings: Record<string, unknown>[], now = NOW) => {
    const d = base(); d.user_settings = settings;
    const box = fakeMailbox(); const r = recorder();
    await silently(() => notifyHostOfRequest("ev1", "bob", { admin: fakeAdmin(d, users), send: box.send, push: r.push, now }));
    return { mail: box.sent.length, push: r.sent.length };
  };
  const off = { user_id: "host", notify_activity: false };
  const q = { user_id: "host", quiet_start: 22, quiet_end: 8 };
  const x1 = await run([]), x2 = await run([off]), x3 = await run([q], MIDNIGHT), x4 = await run([q], NOW), x5 = await run([{ user_id: "host", email_notifications: false }]);
  t("request to a host: by default both an email and a push", x1.mail === 1 && x1.push === 1, JSON.stringify(x1));
  t("request to a host: with 'Activity on my meetups' off, neither", x2.mail === 0 && x2.push === 0, JSON.stringify(x2));
  t("request to a host: in their quiet hours the email still goes but the push waits", x3.mail === 1 && x3.push === 0, JSON.stringify(x3));
  t("request to a host: outside quiet hours it's both again", x4.mail === 1 && x4.push === 1, JSON.stringify(x4));
  t("request to a host: with the master email switch off, just the push", x5.mail === 0 && x5.push === 1, JSON.stringify(x5));

  const decide = async (settings: Record<string, unknown>[], now: Date) => { const d = base(); d.rsvps.push({ event_id: "ev1", user_id: "bob", status: "pending" }); d.user_settings = settings; const box = fakeMailbox(); const r = recorder(); await silently(() => notifyRequestDecision("ev1", "bob", true, { admin: fakeAdmin(d, users), send: box.send, push: r.push, now })); return { mail: box.sent.length, push: r.sent.length }; };
  const everything = { user_id: "bob", notify_reminders: false, notify_matches: false, notify_activity: false, quiet_start: 22, quiet_end: 8 };
  const y = await decide([everything], MIDNIGHT);
  t("answer to your request (critical): still arrives by email and push even with every kind off and in quiet hours", y.mail === 1 && y.push === 1, JSON.stringify(y));

  const cancel = async (settings: Record<string, unknown>[]) => { const d = base(); d.user_settings = settings; const box = fakeMailbox(); const r = recorder(); await silently(() => notifyEventCancelled("ev1", { admin: fakeAdmin(d, users), send: box.send, push: r.push, now: NOW })); return { mail: box.sent.length, push: r.sent.length }; };
  const z = await cancel([{ user_id: "ann", notify_reminders: false, notify_matches: false, notify_activity: false, quiet_start: 0, quiet_end: 23 }]);
  t("cancellation (critical): reaches a guest who switched everything off", z.mail === 1 && z.push === 1, JSON.stringify(z));

  // the daily reminders
  const remind = async (settings: Record<string, unknown>[], now = NOW) => { const d = base(); d.user_settings = settings; const box = fakeMailbox(); const r = recorder(); const res = await silently(() => sendDailyEmails(now, { admin: fakeAdmin(d, users), send: box.send, push: r.push })); return { res, mail: box.sent.map((m) => m.to).sort().join(), push: r.sent.map((p) => p.to).sort().join() }; };
  const a = await remind([]);
  t("reminders: by default the host and the guest both get an email and a push", a.mail === "ann@example.com,host@example.com" && a.push === "ann,host", JSON.stringify(a));
  const b = await remind([{ user_id: "ann", notify_reminders: false }]);
  t("reminders: a guest who switched Reminders off gets nothing (and the result counts it), the host still does", b.mail === "host@example.com" && b.push === "host" && b.res.mutedByPrefs === 1 && b.res.pushMuted === 1, JSON.stringify({ m: b.mail, p: b.push, mb: b.res.mutedByPrefs, pm: b.res.pushMuted }));
  const c2 = await remind([{ user_id: "ann", quiet_start: 22, quiet_end: 8 }], at("2026-09-21T06:00:00Z")); // 11 PM: the day before the meetup
  t("reminders: in a guest's quiet hours they still get the email, but no push", c2.mail === "ann@example.com,host@example.com" && c2.push === "host" && c2.res.pushMuted === 1, JSON.stringify({ m: c2.mail, p: c2.push, pm: c2.res.pushMuted }));
  const d2 = await remind([{ user_id: "ann", email_notifications: false }]);
  t("reminders: the old email switch still counts as opted out exactly as before", d2.res.skipped.optedOut === 1 && d2.mail === "host@example.com" && d2.push === "ann,host", JSON.stringify({ so: d2.res.skipped, m: d2.mail, p: d2.push }));

  // a database that hasn't had migration 019: the email switch must still be honoured
  const old = base(); old.user_settings = [{ user_id: "ann", email_notifications: false }];
  const prefs = await loadPrefs(fakeAdmin(old, users, { noPrefColumns: true }), "ann");
  t("before the database update: the master email switch is still read and honoured (and the rest default to on)", prefs.email === false && prefs.reminders && prefs.matches && prefs.activity && prefs.quietStart === null, JSON.stringify(prefs));
  const box = fakeMailbox();
  await silently(() => sendDailyEmails(NOW, { admin: fakeAdmin(old, users, { noPrefColumns: true }), send: box.send, push: recorder().push }));
  t("before the database update: the daily job still works, and still skips someone who turned emails off", box.sent.map((m) => m.to).join() === "host@example.com");
}

// ───────── the weekly digest ─────────
const THU = at("2026-09-24T16:00:00Z"); // Thursday 9:00 AM Pacific
const digestData = (): FakeData => {
  const ev = (id: string, o: Record<string, unknown> = {}) => ({ id, title: id, category: "Running", neighborhood: "Oakland", starts_at: "2026-09-26T16:00:00Z", host_id: "host", join_mode: "open", venue_name: "Park", address: "1 Main", cancelled_at: null, max_spots: 8, spots_taken: 2, audience: "Everyone", age_min: null, age_max: null, series_id: null, ...o });
  return {
    events: [
      ev("good-run"), ev("other-yoga", { category: "Yoga" }), ev("womens", { audience: "Women-only" }), ev("full", { spots_taken: 8 }),
      ev("thirty-plus", { age_min: 30 }), ev("hosted-by-ann", { host_id: "ann" }), ev("already-joined"), ev("too-far", { starts_at: "2026-10-12T16:00:00Z" }), ev("cancelled", { cancelled_at: "2026-09-22T00:00:00Z" }),
    ],
    rsvps: [{ event_id: "already-joined", user_id: "ann", status: "approved" }],
    profiles: [{ id: "host", name: "Host" }, { id: "ann", name: "Ann Lee" }, { id: "bob", name: "Bob Ray" }, { id: "cy", name: "Cy Ng" }],
    profile_private: [{ user_id: "ann", birth_date: "2000-01-01" }],
    user_interests: [{ user_id: "ann", categories: ["Running"] }, { user_id: "bob", categories: [] }, { user_id: "cy", categories: ["Yoga"] }],
    user_settings: [{ user_id: "cy", notify_matches: false }],
    notification_log: [],
  };
};
{
  const box = fakeMailbox(); const r = recorder(); const d = digestData();
  const res = await silently(() => sendDailyEmails(THU, { admin: fakeAdmin(d, users), send: box.send, push: r.push }));
  const ann = box.sent.find((m) => m.to === "ann@example.com");
  t("digest: on a Thursday, someone with interests gets one email and one push", res.digests === 1 && box.sent.filter((m) => m.to === "ann@example.com").length === 1 && r.sent.some((p) => p.to === "ann" && /meetup/.test(p.title)), JSON.stringify({ d: res.digests, m: box.sent.map((m) => m.to) }));
  t("digest: it lists what matches (the run she'd like, and the yoga after it), and leaves out women-only, full, age-limited, her own, already-joined, too-far and cancelled ones", !!ann && /good-run/.test(ann.text) && /other-yoga/.test(ann.text) && !/womens|full|thirty-plus|hosted-by-ann|already-joined|too-far|cancelled/.test(ann.text.replace(/already-joined/g, "").replace(/(^|\W)full(\W|$)/g, " ")), ann?.text);
  t("digest: the matching meetup comes first", ann!.text.indexOf("good-run") < ann!.text.indexOf("other-yoga"));
  t("digest: nobody with no interests picked, or with 'New meetups for you' off, is sent one", !box.sent.some((m) => m.to === "bob@example.com" || m.to === "cy@example.com") && res.mutedByPrefs === 1);
  t("digest: it shows the neighborhood, never a street address", !/1 Main|Park,/.test(ann!.text) && /Oakland/.test(ann!.text));
  t("digest: it's recorded, so it can't be sent twice", d.notification_log.filter((x) => x.kind === "digest" && x.user_id === "ann").length === 1);
  const again = await silently(() => sendDailyEmails(THU, { admin: fakeAdmin(d, users), send: box.send, push: r.push }));
  t("digest: running the daily job again the same day sends nothing more", again.digests === 0 && box.sent.filter((m) => m.to === "ann@example.com").length === 1, JSON.stringify(again.digests));
}
{
  const box = fakeMailbox(); const d = digestData();
  const res = await silently(() => sendDailyEmails(at("2026-09-23T16:00:00Z"), { admin: fakeAdmin(d, users), send: box.send, push: recorder().push })); // Wednesday
  t("digest: on any other day of the week nothing is sent", res.digests === 0 && !box.sent.some((m) => /might like/.test(m.subject)));
}
{
  const d = digestData(); d.events = d.events.filter((e) => e.id === "womens" || e.id === "full");
  const box = fakeMailbox();
  const res = await silently(() => sendDailyEmails(THU, { admin: fakeAdmin(d, users), send: box.send, push: recorder().push }));
  t("digest: when nothing fits, nothing is sent (and nothing is recorded, so next week can still send one)", res.digests === 0 && box.sent.length === 0 && d.notification_log.length === 0);
}
{
  const d = digestData(); d.notification_log = [{ user_id: "ann", kind: "digest", ref: "2026-09-21", created_at: "2026-09-21T16:00:00Z" }];
  const box = fakeMailbox();
  const res = await silently(() => sendDailyEmails(THU, { admin: fakeAdmin(d, users), send: box.send, push: recorder().push }));
  t("digest: never more than one in six days, even if the job runs on a different date", res.digests === 0 && box.sent.length === 0);
}
{
  const d = digestData(); const box = fakeMailbox(); const r = recorder();
  const res = await silently(() => sendDailyEmails(THU, { admin: fakeAdmin(d, users, { logError: true }), send: box.send, push: r.push }));
  t("digest: if the send log is unavailable, nothing is sent (it fails safe, not spammy)", res.digests === 0 && box.sent.length === 0 && r.sent.length === 0);
}
{
  const d = digestData(); const box = fakeMailbox(); const r = recorder();
  const anHourAgo = new Date(THU.getTime() - 3600000).toISOString();
  d.notification_log = [1, 2, 3].map((i) => ({ user_id: "ann", kind: "friend_joined", ref: `r${i}`, created_at: anHourAgo }));
  const res = await silently(() => sendDailyEmails(THU, { admin: fakeAdmin(d, users), send: box.send, push: r.push }));
  t("nudge limit: someone already sent 3 nudges today still gets the digest by email, but no extra push", res.digests === 1 && box.sent.some((m) => m.to === "ann@example.com") && !r.sent.some((p) => p.to === "ann" && /meetup/.test(p.title)), JSON.stringify({ d: res.digests, pushes: r.sent.length }));
}
{
  const d = digestData(); d.user_settings = [{ user_id: "ann", quiet_start: 8, quiet_end: 10 }, { user_id: "cy", notify_matches: false }]; // Thursday 9 AM is inside these quiet hours
  const box = fakeMailbox(); const r = recorder();
  const res = await silently(() => sendDailyEmails(THU, { admin: fakeAdmin(d, users), send: box.send, push: r.push }));
  t("digest: inside the person's quiet hours the email still goes; the push is skipped", res.digests === 1 && box.sent.some((m) => m.to === "ann@example.com") && !r.sent.some((p) => p.to === "ann") && res.pushMuted >= 1);
}

// ───────── the screens and doors ─────────
{
  const actions = read("app/actions.ts");
  const save = actions.slice(actions.indexOf("export async function saveNotificationPrefs"), actions.indexOf("/** Saves interests."));
  t("settings action: needs a login, and only saves real booleans and real hours", /getUser\(\)/.test(save) && /typeof f === "boolean"/.test(save) && /v >= 0 && v <= 23/.test(save));
  t("settings action: quiet hours are stored as a pair, or not at all (the same hour twice means none)", /start !== null && end !== null && start !== end/.test(save));
  t("settings action: it saves through the shared update-then-insert helper (which the database's column rules allow)", /updateOrInsert\(/.test(save) && /notify_reminders/.test(save) && /quiet_start/.test(save));
  const comp = read("components/NotificationSettings.tsx");
  t("settings card: one switch per kind, quiet hours, and it saves as you change it", (comp.match(/role="switch"/g) ?? []).length === 1 && /KINDS\.map/.test(comp) && /id="quiet-hours"/.test(comp) && /saveNotificationPrefs/.test(comp));
  t("settings card: it tells people what always comes through", /always come through/.test(comp));
  const me = read("app/me/page.tsx");
  t("Me: the card is in the Notifications section, and before the database update it still loads the email switch", /<NotificationSettings initial=\{prefs\} \/>/.test(me) && /if \(settingsRes\.error\) settingsRes = await supabase\.from\("user_settings"\)\.select\("email_notifications"\)/.test(me));
  const prompt = read("components/PushPrompt.tsx");
  const page = read("app/events/[id]/page.tsx");
  t("push prompt: shown on a meetup page only to a guest who has joined or asked (never the host, never before joining, not for cancelled or finished meetups)", /!isHost && \(myStatus === "approved" \|\| myStatus === "pending"\) && !cancelled && !ended && <PushPrompt \/>/.test(page));
  t("push prompt: never shown again after 'Not now' or after saying no in the browser's own box", /localStorage\.setItem\(DISMISSED/.test(prompt) && /dismiss\(\); \/\/ said no in the browser/.test(prompt) && /localStorage\.getItem\(DISMISSED\)/.test(prompt));
  t("push prompt: hidden when push isn't set up, already on, or blocked; on iPhone it explains adding to the Home Screen", /if \(!PUBLIC_KEY\) return/.test(prompt) && /thisDeviceSubscription\(\)/.test(prompt) && /permission === "denied"|Notification\.permission === "denied"/.test(prompt) && /Add to Home Screen/.test(prompt));
  t("push prompt: uses the shared subscribe helper and the same server action as Settings", /enableThisDevice\(PUBLIC_KEY, savePushSubscription\)/.test(prompt) && /export async function enableThisDevice/.test(read("lib/push-client.ts")));
  const notify = read("lib/notify.ts");
  t("digest: only on Thursdays, only for people who picked interests, claimed before sending", /pacificWeekday\(now\) === DIGEST_WEEKDAY/.test(notify) && /categories\.length === 0\) continue/.test(notify) && notify.indexOf('claimSend(admin, id, "digest"') > notify.indexOf("picks.length === 0") && notify.indexOf('claimSend(admin, id, "digest"') < notify.indexOf("email.weeklyDigest"));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
