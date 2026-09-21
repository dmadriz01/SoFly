// The three marketplace numbers on the admin overview. `npm run test:unit`.
// Worked by hand: each case says what the right answer is and why.
import fs from "node:fs";
import path from "node:path";
import { CROWD_WINDOW_DAYS, HOST_WAIT_DAYS, MIN_GUESTS, RETURN_WINDOW_DAYS, computeHealth, type HealthEvent, type HealthRsvp } from "../lib/admin-health.ts";
import { computeStats } from "../lib/admin-stats.ts";

let passed = 0;
let failed = 0;
const t = (name: string, cond: boolean, extra = "") => {
  cond ? passed++ : failed++;
  console.log(`${cond ? "ok   " : "FAIL "}${name}${cond ? "" : "  -> " + extra}`);
};
const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

const NOW = new Date("2026-10-31T18:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();
let seq = 0;
const ev = (host: string, startDaysAgo: number, o: Partial<HealthEvent> = {}): HealthEvent => ({ id: `e${++seq}`, host_id: host, starts_at: daysAgo(startDaysAgo), created_at: daysAgo(startDaysAgo + 5), cancelled_at: null, ...o });
const going = (user: string, e: HealthEvent, status = "approved"): HealthRsvp => ({ user_id: user, event_id: e.id, status });

t("settings: the limits are the ones written down (2 guests, 90 days, 28 days, 14 days)", MIN_GUESTS === 2 && CROWD_WINDOW_DAYS === 90 && RETURN_WINDOW_DAYS === 28 && HOST_WAIT_DAYS === 14);

// ───────── 1. meetups with a real crowd ─────────
{
  const full = ev("h", 10), thin = ev("h", 9), empty = ev("h", 8), cancelled = ev("h", 7, { cancelled_at: daysAgo(8) }), future = ev("h", -3), old = ev("h", 120), justEnough = ev("h", 6);
  const rsvps = [
    going("h", full), going("a", full), going("b", full), going("c", full), // host + 3
    going("h", thin), going("a", thin), // host + 1: not enough
    going("h", empty), // just the host
    going("a", cancelled), going("b", cancelled), going("c", cancelled),
    going("a", future), going("b", future), going("c", future),
    going("a", old), going("b", old), going("c", old),
    going("h", justEnough), going("a", justEnough), going("b", justEnough), // host + exactly 2
    going("d", thin, "pending"), going("e", thin, "declined"), // requests aren't people who came
  ];
  const h = computeHealth({ now: NOW, events: [full, thin, empty, cancelled, future, old, justEnough], rsvps });
  t("crowd: counts meetups that happened in the last 90 days, without cancelled, upcoming or older ones", h.crowd.of === 4, JSON.stringify(h.crowd));
  t("crowd: the host plus 2 guests is enough; the host plus 1 is not; the host alone is not", h.crowd.yes === 2 && h.crowd.percent === 50, JSON.stringify(h.crowd));
  t("crowd: pending and declined requests don't count as people who came", (computeHealth({ now: NOW, events: [thin], rsvps: [going("a", thin), going("d", thin, "pending"), going("e", thin, "declined")] }).crowd.yes) === 0);
  t("crowd: a host's own row doesn't count as a guest", computeHealth({ now: NOW, events: [empty], rsvps: [going("h", empty), going("h", empty)] }).crowd.yes === 0);
  t("crowd: nothing has happened yet -> no percentage, not NaN", computeHealth({ now: NOW, events: [], rsvps: [] }).crowd.percent === null && computeHealth({ now: NOW, events: [future], rsvps: [] }).crowd.percent === null);
}

// ───────── 2. guests coming back ─────────
{
  const e1 = ev("h", 60), e2 = ev("h", 45), e3 = ev("h", 20), e4 = ev("h", 5), e5 = ev("h", 40), e6 = ev("h", 2);
  const rsvps = [
    // Ann: first at 60 days ago, again 45 days ago (15 days later) -> came back
    going("ann", e1), going("ann", e2),
    // Bob: first 60 days ago, next only 20 days ago (40 days later) -> too late for "within 28 days"
    going("bob", e1), going("bob", e3),
    // Cy: first 60 days ago, never again -> did not come back
    going("cy", e1),
    // Dee: first meetup 5 days ago -> too early to judge
    going("dee", e4),
    // Eve: first 40 days ago, second 2 days ago -> the second is 38 days later, not within 28
    going("eve", e5), going("eve", e6),
    // Fay: joined a meetup but is only pending -> never went
    going("fay", e1, "pending"),
    // The host of every meetup is not a "guest"
    going("h", e1), going("h", e2),
  ];
  const h = computeHealth({ now: NOW, events: [e1, e2, e3, e4, e5, e6], rsvps }).guestReturn;
  t("guests: people whose first meetup is under 28 days old are 'waiting', not counted for or against", h.waiting === 1 && h.of === 4, JSON.stringify(h));
  t("guests: only a second meetup within 28 days of the first counts as coming back", h.yes === 1 && h.percent === 25, JSON.stringify(h));
  t("guests: 'so far' counts anyone who has been to 2+ meetups at any point (Ann, Bob, Eve)", h.repeatEver === 3 && h.firstTimers === 5, JSON.stringify(h));
  t("guests: the host isn't a guest, and a pending request isn't someone who went", h.firstTimers === 5);
  const sameDay = ev("h", 40), sameDay2 = ev("h", 40);
  t("guests: two meetups at the very same time aren't 'coming back' (the second has to be later)", computeHealth({ now: NOW, events: [sameDay, sameDay2], rsvps: [going("x", sameDay), going("x", sameDay2)] }).guestReturn.yes === 0, "equal times are not later");
  const later = ev("h", 39);
  t("guests: ...but a meetup a day later does", computeHealth({ now: NOW, events: [sameDay, later], rsvps: [going("x", sameDay), going("x", later)] }).guestReturn.yes === 1);
  const future = ev("h", -5);
  t("guests: signing up for a future meetup isn't coming back until it happens", computeHealth({ now: NOW, events: [e1, future], rsvps: [going("x", e1), going("x", future)] }).guestReturn.yes === 0);
  const called = ev("h", 30, { cancelled_at: daysAgo(31) });
  t("guests: a cancelled meetup isn't one they went to", computeHealth({ now: NOW, events: [e1, called], rsvps: [going("x", e1), going("x", called)] }).guestReturn.yes === 0);
  t("guests: no data -> no percentage", computeHealth({ now: NOW, events: [], rsvps: [] }).guestReturn.percent === null);
}

// ───────── 3. hosts who post again ─────────
{
  const a1 = ev("ha", 30, { created_at: daysAgo(40) }), a2 = ev("ha", 10, { created_at: daysAgo(20) }); // two separate posts
  const b1 = ev("hb", 30, { created_at: daysAgo(40) }); // one post, 40 days ago
  const c1 = ev("hc", 5, { created_at: daysAgo(6) }); // first post 6 days ago: too early
  // hd posts one series of 4 dates in one go: ONE post
  const d = [0, 1, 2, 3].map((i) => ev("hd", 30 - i * 7, { created_at: daysAgo(35), series_id: "S1" }));
  // he posts a series, then a single one: TWO posts
  const e = [0, 1].map((i) => ev("he", 30 - i * 7, { created_at: daysAgo(38), series_id: "S2" }));
  const e2 = ev("he", 3, { created_at: daysAgo(10) });
  // hf posted once, cancelled it, posted nothing else: no post that happened
  const f1 = ev("hf", 20, { created_at: daysAgo(30), cancelled_at: daysAgo(25) });
  const h = computeHealth({ now: NOW, events: [a1, a2, b1, c1, ...d, ...e, e2, f1], rsvps: [] }).hostAgain;
  t("hosts: hosts whose first post is under 14 days old are 'waiting'", h.waiting === 1, JSON.stringify(h));
  t("hosts: judged = hosts with a post 14+ days old (Ann, Bo, Dee, Eli); a host with only cancelled meetups isn't a host yet", h.of === 4 && h.hosts === 5, JSON.stringify(h));
  t("hosts: two separate posts = posted again (Ann, Eli); one post, or one series in one go = not (Bo, Dee)", h.yes === 2 && h.percent === 50, JSON.stringify(h));
  t("hosts: hosts who run a recurring series are counted on the side (Dee, Eli)", h.withSeries === 2, JSON.stringify(h));
  t("hosts: without series ids (an older database) every meetup counts as its own post", computeHealth({ now: NOW, events: d.map((x) => ({ ...x, series_id: undefined })), rsvps: [] }).hostAgain.yes === 1);
  t("hosts: no data -> no percentage", computeHealth({ now: NOW, events: [], rsvps: [] }).hostAgain.percent === null);
}

// ───────── it's wired into the overview ─────────
{
  const s = computeStats({ now: NOW, profiles: [], events: [], rsvps: [], reports: { total: 0, open: 0 }, pushDevices: 0, truncated: false });
  t("overview: the numbers are part of the stats, and an empty database gives dashes rather than NaN", s.health.crowd.percent === null && s.health.guestReturn.percent === null && s.health.hostAgain.percent === null);
  const view = read("components/AdminView.tsx");
  t("overview: the page shows them above the totals", /<HealthSection health=\{s\.health\} \/>[\s\S]{0,80}aria-labelledby="totals"/.test(view));
  const data = read("lib/admin-data.ts");
  t("overview: series ids are read on the side, so a database from before 019 still loads the overview", /try \{[\s\S]{0,400}select\("id, series_id"\)[\s\S]{0,400}\} catch/.test(data) && !/"id, host_id, category, neighborhood, starts_at, created_at, cancelled_at, max_spots, spots_taken, feedback_yes, feedback_total, series_id"/.test(data));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
