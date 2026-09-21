// The admin view: who counts as an admin, the numbers it shows, what it reads, and what it can do.
// Runs the real logic against a fake database. Run with `npm run test:unit`.
import fs from "node:fs";
import path from "node:path";
import { buildReportEmail } from "../lib/alerts.ts";
import { cancelEventAsModerator, reinstateEvent, setReportReviewed } from "../lib/admin-actions.ts";
import { isAdminEmail, isAdminUser, parseAdminEmails } from "../lib/admin-access.ts";
import { escapeLike, loadEvents, loadReports, loadStats, countOpenReports } from "../lib/admin-data.ts";
import { CHART_DAYS, computeStats, lastDays, topCounts } from "../lib/admin-stats.ts";
import { fakeAdmin, type FakeData } from "./fake-supabase.mts";

let passed = 0;
let failed = 0;
const t = (name: string, cond: boolean, extra = "") => {
  cond ? passed++ : failed++;
  console.log(`${cond ? "ok   " : "FAIL "}${name}${cond ? "" : "  -> " + extra}`);
};
const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

// ───────── who is an admin ─────────
{
  const LIST = "Dmadriz@Berkeley.edu, second@example.com;  third@example.com  \"quoted@example.com\"";
  t("admin list: commas, semicolons, spaces and quotes all work; case is ignored", parseAdminEmails(LIST).join("|") === "dmadriz@berkeley.edu|second@example.com|third@example.com|quoted@example.com", parseAdminEmails(LIST).join("|"));
  t("admin list: not set or empty means nobody is an admin", parseAdminEmails(undefined).length === 0 && parseAdminEmails("").length === 0 && !isAdminEmail("a@b.co", "") && !isAdminEmail("a@b.co", undefined as unknown as string));
  t("admin list: junk without an @ is ignored", parseAdminEmails("everyone, *, admin").length === 0);
  t("admin: an exact address matches, in any letter case", isAdminEmail("DMADRIZ@berkeley.EDU", LIST) && isAdminEmail(" second@example.com ", LIST));
  t("admin: a look-alike or partial address does not", !isAdminEmail("dmadriz@berkeley.edu.evil.com", LIST) && !isAdminEmail("xdmadriz@berkeley.edu", LIST) && !isAdminEmail("dmadriz@berkeley.edu ", "other@x.com") && !isAdminEmail("dmadriz+1@berkeley.edu", LIST));
  t("admin: a whole domain or wildcard in the list matches nobody new", !isAdminEmail("anyone@berkeley.edu", "@berkeley.edu, *@berkeley.edu, *"));
  t("admin: no email means not an admin", !isAdminEmail(null, LIST) && !isAdminEmail(undefined, LIST) && !isAdminEmail("", LIST));
  t("admin: a logged-in person must have a VERIFIED address", isAdminUser({ email: "second@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" }, LIST) && !isAdminUser({ email: "second@example.com", email_confirmed_at: null }, LIST) && !isAdminUser({ email: "second@example.com" }, LIST));
  t("admin: nobody logged in is not an admin", !isAdminUser(null, LIST) && !isAdminUser(undefined, LIST));
  const saved = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = "env@example.com";
  t("admin: the ADMIN_EMAILS setting is what's used by default", isAdminEmail("env@example.com") && !isAdminEmail("other@example.com") && isAdminUser({ email: "ENV@example.com", email_confirmed_at: "x" }));
  delete process.env.ADMIN_EMAILS;
  t("admin: with the setting removed, the same person is no longer an admin", !isAdminEmail("env@example.com"));
  if (saved !== undefined) process.env.ADMIN_EMAILS = saved;
}

// ───────── the numbers ─────────
// "Now" is Sunday Sep 20 2026, 12:00 PM Pacific (19:00 UTC).
const NOW = new Date("2026-09-20T19:00:00Z");
const iso = (d: string) => new Date(d).toISOString();
const ev = (o: Record<string, unknown>) => ({ host_id: "h1", category: "Running", neighborhood: "Oakland", starts_at: "2026-09-25T02:00:00Z", created_at: "2026-09-01T00:00:00Z", cancelled_at: null, max_spots: 10, spots_taken: 0, feedback_yes: 0, feedback_total: 0, ...o });
const events = [
  ev({ id: "up1", spots_taken: 3, created_at: "2026-09-19T00:00:00Z" }),                                  // upcoming, has guests, created yesterday
  ev({ id: "up2", host_id: "h2", category: "Coffee Chat", neighborhood: "SF - Mission", created_at: "2026-08-25T00:00:00Z" }), // upcoming, nobody joined
  ev({ id: "held1", starts_at: "2026-09-10T02:00:00Z", max_spots: 10, spots_taken: 8, feedback_yes: 3, feedback_total: 4, created_at: "2026-08-20T00:00:00Z" }),
  ev({ id: "held2", host_id: "h2", starts_at: "2026-09-12T02:00:00Z", max_spots: 10, spots_taken: 2, feedback_yes: 1, feedback_total: 1, created_at: "2026-07-01T00:00:00Z" }),
  ev({ id: "cxl", category: "Dinner", cancelled_at: "2026-09-15T00:00:00Z", max_spots: 10, spots_taken: 9, created_at: "2026-09-14T00:00:00Z" }), // cancelled: not in fill rate, not in top lists
];
const rsvps = [
  { user_id: "h1", event_id: "up1", status: "approved", created_at: "2026-09-19T00:00:00Z" },   // the host's own row: not a join
  { user_id: "a", event_id: "up1", status: "approved", created_at: "2026-09-19T12:00:00Z" },
  { user_id: "b", event_id: "up1", status: "approved", created_at: "2026-09-10T12:00:00Z" },
  { user_id: "c", event_id: "up1", status: "pending", created_at: "2026-09-19T13:00:00Z" },
  { user_id: "c", event_id: "held1", status: "pending", created_at: "2026-09-01T13:00:00Z" },    // pending on a PAST meetup: not "waiting"
  { user_id: "a", event_id: "held1", status: "approved", created_at: "2026-09-01T00:00:00Z" },
  { user_id: "ghost", event_id: "deleted-event", status: "approved", created_at: "2026-09-19T00:00:00Z" }, // orphan: ignored
];
const profiles = [
  { created_at: "2026-09-20T18:00:00Z" },  // today
  { created_at: "2026-09-14T00:00:00Z" },  // 6 days ago
  { created_at: "2026-09-05T00:00:00Z" },  // 15 days ago
  { created_at: "2026-06-01T00:00:00Z" },  // long ago
  { created_at: "2026-09-21T06:30:00Z" },  // 11:30 PM Pacific on Sep 20 (a future-dated row: must not be counted as "recent")
];
{
  const s = computeStats({ now: NOW, profiles, events, rsvps, reports: { total: 5, open: 2 }, pushDevices: 3, truncated: false });
  t("members: total, last 7 days, last 30 days", s.members.total === 5 && s.members.last7 === 2 && s.members.last30 === 3, JSON.stringify(s.members));
  t("members: how many have hosted and how many have joined someone", s.members.hosted === 2 && s.members.joined === 2, JSON.stringify(s.members));
  t("meetups: upcoming, held, cancelled, total", s.meetups.total === 5 && s.meetups.upcoming === 2 && s.meetups.held === 2 && s.meetups.cancelled === 1, JSON.stringify(s.meetups));
  t("meetups: created in the last 7 and 30 days", s.meetups.last7 === 2 && s.meetups.last30 === 3, JSON.stringify(s.meetups));
  t("meetups: upcoming ones nobody has joined yet (the host doesn't count)", s.meetups.upcomingWithNoGuests === 1, JSON.stringify(s.meetups));
  t("joins: the host's own row and orphan rows aren't joins", s.joins.total === 3 && s.joins.last7 === 1, JSON.stringify(s.joins));
  t("joins: requests waiting only counts meetups that haven't happened", s.joins.pendingOnUpcoming === 1, JSON.stringify(s.joins));
  t("fill rate: seats filled at meetups that already happened, cancelled ones left out", s.fillRate === 50, String(s.fillRate));
  t("would join again: totals and percent", s.wouldJoinAgain.yes === 4 && s.wouldJoinAgain.total === 5 && s.wouldJoinAgain.percent === 80, JSON.stringify(s.wouldJoinAgain));
  t("reports and push devices are passed through", s.reports.open === 2 && s.reports.total === 5 && s.pushDevices === 3);
  t("top categories leave out cancelled meetups, biggest first", s.topCategories.map((c) => `${c.label}:${c.count}`).join() === "Running:3,Coffee Chat:1", JSON.stringify(s.topCategories));
  t("top neighborhoods", s.topNeighborhoods[0].label === "Oakland" && s.topNeighborhoods[0].count === 3);
  t(`daily chart: ${CHART_DAYS} Pacific days ending today, oldest first`, s.days.length === CHART_DAYS && s.days.at(-1)!.date === "2026-09-20" && s.days[0].date === "2026-09-07", `${s.days[0].date}..${s.days.at(-1)!.date}`);
  const day = (d: string) => s.days.find((x) => x.date === d)!;
  t("daily chart: a sign-up at 11:30 PM Pacific lands on that Pacific day, not the next UTC day", day("2026-09-20").members === 2, JSON.stringify(day("2026-09-20")));
  // Midnight UTC is the previous evening in Pacific time, so these belong to the day before their UTC date.
  t("daily chart: everything lands on its Pacific day (a row stamped 00:00 UTC belongs to the evening before)", day("2026-09-18").meetups === 1 && day("2026-09-13").meetups === 1 && day("2026-09-13").members === 1 && day("2026-09-19").joins === 1 && day("2026-09-10").joins === 1 && day("2026-09-19").meetups === 0, JSON.stringify(s.days.filter((d) => d.meetups || d.joins || d.members)));
  t("a partial read is flagged", computeStats({ now: NOW, profiles, events, rsvps, reports: { total: 0, open: 0 }, pushDevices: 0, truncated: true }).truncated === true && s.truncated === false);
}
{
  const e = computeStats({ now: NOW, profiles: [], events: [], rsvps: [], reports: { total: 0, open: 0 }, pushDevices: 0, truncated: false });
  t("an empty database gives zeros and 'no data' (not NaN or a crash)", e.members.total === 0 && e.fillRate === null && e.wouldJoinAgain.percent === null && e.topCategories.length === 0 && e.days.every((d) => d.members + d.meetups + d.joins === 0));
  t("chart days are calendar days even across the November clock change", lastDays(new Date("2026-11-02T20:00:00Z"), 4).join() === "2026-10-30,2026-10-31,2026-11-01,2026-11-02");
  t("top counts: ties break alphabetically, blanks ignored, capped", topCounts(["b", "a", "b", "a", "", "c"], 2).map((x) => x.label).join() === "a,b");
}

// ───────── what the page reads ─────────
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fx = () => {
  const d: FakeData = {
    profiles: [{ id: "h1", name: "Host One", created_at: "2026-01-01T00:00:00Z" }, { id: "h2", name: "Host Two", created_at: "2026-01-02T00:00:00Z" }, { id: "r1", name: "Reporter", created_at: "2026-01-03T00:00:00Z" }, { id: "r2", name: "", created_at: "2026-01-03T00:00:00Z" }],
    events: [
      { id: UUID(1), host_id: "h1", title: "Sunrise run", category: "Running", neighborhood: "Oakland", starts_at: "2026-09-25T02:00:00Z", created_at: "2026-09-01T00:00:00Z", cancelled_at: null, max_spots: 10, spots_taken: 3, join_mode: "open", audience: "Everyone", feedback_yes: 0, feedback_total: 0 },
      { id: UUID(2), host_id: "h2", title: "100% fun run", category: "Running", neighborhood: "SF - Mission", starts_at: "2026-09-26T02:00:00Z", created_at: "2026-09-02T00:00:00Z", cancelled_at: null, max_spots: 5, spots_taken: 1, join_mode: "request", audience: "Women-only", feedback_yes: 0, feedback_total: 0 },
      { id: UUID(3), host_id: "h1", title: "1000 fun run", category: "Running", neighborhood: "Oakland", starts_at: "2026-09-27T02:00:00Z", created_at: "2026-09-03T00:00:00Z", cancelled_at: null, max_spots: 5, spots_taken: 0, join_mode: "open", audience: "Everyone", feedback_yes: 0, feedback_total: 0 },
      { id: UUID(4), host_id: "h2", title: "Old brunch", category: "Food & Drink", neighborhood: "Berkeley", starts_at: "2026-09-01T02:00:00Z", created_at: "2026-08-01T00:00:00Z", cancelled_at: null, max_spots: 8, spots_taken: 6, join_mode: "open", audience: "Everyone", feedback_yes: 0, feedback_total: 0 },
      { id: UUID(5), host_id: "h1", title: "Called off", category: "Dinner", neighborhood: "Oakland", starts_at: "2026-09-30T02:00:00Z", created_at: "2026-09-04T00:00:00Z", cancelled_at: "2026-09-18T00:00:00Z", max_spots: 8, spots_taken: 2, join_mode: "open", audience: "Everyone", feedback_yes: 0, feedback_total: 0 },
    ],
    rsvps: [],
    reports: [
      { id: UUID(101), event_id: UUID(2), reporter_id: "r1", reason: "Spam or scam", details: "looks fake", created_at: "2026-09-19T10:00:00Z", reviewed_at: null },
      { id: UUID(102), event_id: UUID(2), reporter_id: "r2", reason: "Other", details: "", created_at: "2026-09-19T11:00:00Z", reviewed_at: null },
      { id: UUID(103), event_id: UUID(1), reporter_id: "r1", reason: "Unsafe", details: "", created_at: "2026-09-18T11:00:00Z", reviewed_at: "2026-09-18T12:00:00Z" },
    ],
    push_subscriptions: [{ id: "p1" }, { id: "p2" }],
  };
  return d;
};
const NOWR = new Date("2026-09-20T19:00:00Z");
{
  const admin = fakeAdmin(fx(), {});
  const open = await loadReports(admin, { showReviewed: false });
  t("reports: open ones only by default, newest first", open.map((r) => r.id).join() === `${UUID(102)},${UUID(101)}`, open.map((r) => r.id).join());
  t("reports: shows meetup, host and reporter by name (never an email)", open[1].eventTitle === "100% fun run" && open[1].hostName === "Host Two" && open[1].reporterName === "Reporter" && !JSON.stringify(open).includes("@"), JSON.stringify(open[1]));
  t("reports: a reporter with no name isn't blank", open[0].reporterName === "(no name)");
  t("reports: says how many reports the same meetup has had", open[0].reportsOnEvent === 2, String(open[0].reportsOnEvent));
  const all = await loadReports(admin, { showReviewed: true });
  t("reports: 'show reviewed' adds the reviewed ones, marked as such", all.length === 3 && all.find((r) => r.id === UUID(103))!.reviewedAt !== null);
  t("reports: the open count for the tab badge", (await countOpenReports(admin)) === 2);
  t("reports: none open gives an empty list", (await loadReports(fakeAdmin({ ...fx(), reports: [] }, {}), { showReviewed: false })).length === 0);
}
{
  const admin = fakeAdmin(fx(), {});
  const ids = async (o: Partial<Parameters<typeof loadEvents>[1]>) => (await loadEvents(admin, { filter: "all", q: "", limit: 50, now: NOWR, ...o })).map((e) => e.id);
  t("meetups: upcoming = not cancelled and not started, soonest first", (await ids({ filter: "upcoming" })).join() === [UUID(1), UUID(2), UUID(3)].join(), (await ids({ filter: "upcoming" })).join());
  t("meetups: past = already started, most recent first", (await ids({ filter: "past" })).join() === UUID(4));
  t("meetups: cancelled", (await ids({ filter: "cancelled" })).join() === UUID(5));
  t("meetups: all, newest posted first", (await ids({})).join() === [UUID(5), UUID(3), UUID(2), UUID(1), UUID(4)].join(), (await ids({})).join());
  t("meetups: a limit caps the list", (await ids({ limit: 2 })).length === 2);
  t("meetups: search by title, ignoring case", (await ids({ q: "SUNRISE" })).join() === UUID(1));
  t("meetups: a % in the search is literal, not a wildcard ('100%' finds only '100% fun run')", (await ids({ q: "100%" })).join() === UUID(2), (await ids({ q: "100%" })).join());
  t("meetups: an _ in the search is literal too ('1_0' finds nothing)", (await ids({ q: "1_0" })).length === 0);
  t("meetups: a backslash in the search doesn't break it", (await ids({ q: "\\" })).length === 0);
  t("escapeLike escapes the three special characters", escapeLike("a%b_c\\d") === "a\\%b\\_c\\\\d");
  const row = (await loadEvents(admin, { filter: "all", q: "100%", limit: 5, now: NOWR }))[0];
  t("meetups: shows host name, spots and OPEN report count (reviewed ones don't count)", row.hostName === "Host Two" && row.spotsTaken === 1 && row.maxSpots === 5 && row.openReports === 2, JSON.stringify(row));
  t("meetups: a reviewed report doesn't count as open", (await loadEvents(admin, { filter: "all", q: "Sunrise", limit: 5, now: NOWR }))[0].openReports === 0);
  t("meetups: none found gives an empty list", (await ids({ q: "zzz" })).length === 0);
}
{
  // more than one page of rows must all be counted, and a huge table is flagged as partial
  const many: FakeData = { profiles: Array.from({ length: 2500 }, (_, i) => ({ id: `p${i}`, created_at: "2026-09-19T00:00:00Z" })), events: [], rsvps: [], reports: [], push_subscriptions: [] };
  const s = await loadStats(fakeAdmin(many, {}), NOWR);
  t("stats: reads past the 1000-row page limit (2500 members counted)", s.members.total === 2500 && s.truncated === false, JSON.stringify(s.members));
  const huge: FakeData = { profiles: Array.from({ length: 10500 }, (_, i) => ({ id: `p${i}`, created_at: "2026-09-19T00:00:00Z" })), events: [], rsvps: [], reports: [], push_subscriptions: [] };
  const h = await loadStats(fakeAdmin(huge, {}), NOWR);
  t("stats: a table over 10,000 rows is read up to the cap and flagged as partial", h.members.total === 10000 && h.truncated === true, JSON.stringify({ n: h.members.total, tr: h.truncated }));
  const d = fx(); d.rsvps = [{ id: "x1", user_id: "r1", event_id: UUID(1), status: "approved", created_at: "2026-09-19T00:00:00Z" }, { id: "x2", user_id: "h1", event_id: UUID(1), status: "approved", created_at: "2026-09-19T00:00:00Z" }];
  const s2 = await loadStats(fakeAdmin(d, {}), NOWR);
  t("stats: end to end from the database rows", s2.members.total === 4 && s2.meetups.total === 5 && s2.joins.total === 1 && s2.reports.open === 2 && s2.pushDevices === 2, JSON.stringify({ m: s2.members, me: s2.meetups, j: s2.joins, r: s2.reports }));
}

// ───────── what a moderator can do ─────────
{
  const d = fx();
  const told: string[] = [];
  const admin = fakeAdmin(d, {});
  const bad = await cancelEventAsModerator(admin, "not-an-id", (id) => told.push(id), NOWR);
  t("cancel: a made-up id is refused and changes nothing", !!bad.error && told.length === 0 && d.events.every((e) => e.id === UUID(5) || e.cancelled_at === null));
  const missing = await cancelEventAsModerator(admin, UUID(99), (id) => told.push(id), NOWR);
  t("cancel: a meetup that doesn't exist is refused, and nobody is notified", !!missing.error && told.length === 0);
  const ok = await cancelEventAsModerator(admin, UUID(2), (id) => told.push(id), NOWR);
  t("cancel: works, and the guests are notified exactly once", !ok.error && told.join() === UUID(2), JSON.stringify({ ok, told }));
  t("cancel: it's now cancelled at the given moment, and only that meetup changed", d.events.find((e) => e.id === UUID(2))!.cancelled_at === NOWR.toISOString() && d.events.find((e) => e.id === UUID(1))!.cancelled_at === null && d.events.find((e) => e.id === UUID(3))!.cancelled_at === null);
  t("cancel: its open reports are closed; another meetup's reports and already-closed ones are untouched", d.reports.filter((r) => r.event_id === UUID(2)).every((r) => r.reviewed_at === NOWR.toISOString()) && d.reports.find((r) => r.id === UUID(103))!.reviewed_at === "2026-09-18T12:00:00Z");
  const again = await cancelEventAsModerator(admin, UUID(2), (id) => told.push(id), NOWR);
  t("cancel: doing it twice is refused and doesn't notify a second time", !!again.error && told.length === 1);
  const already = await cancelEventAsModerator(admin, UUID(5), (id) => told.push(id), NOWR);
  t("cancel: an already-cancelled meetup keeps its original cancellation time and notifies nobody", !!already.error && told.length === 1 && d.events.find((e) => e.id === UUID(5))!.cancelled_at === "2026-09-18T00:00:00Z");

  const re = await reinstateEvent(admin, UUID(2));
  t("reinstate: clears the cancellation", !re.error && d.events.find((e) => e.id === UUID(2))!.cancelled_at === null);
  t("reinstate: a meetup that isn't cancelled is refused", !!(await reinstateEvent(admin, UUID(1))).error && !!(await reinstateEvent(admin, "nope")).error);
  t("reinstate: doesn't notify anyone", told.length === 1);

  const rv = await setReportReviewed(admin, UUID(101), true, NOWR);
  t("report: mark reviewed", !rv.error && d.reports.find((r) => r.id === UUID(101))!.reviewed_at === NOWR.toISOString());
  const ro = await setReportReviewed(admin, UUID(101), false, NOWR);
  t("report: reopen", !ro.error && d.reports.find((r) => r.id === UUID(101))!.reviewed_at === null);
  t("report: unknown or invalid id is refused", !!(await setReportReviewed(admin, UUID(999), true)).error && !!(await setReportReviewed(admin, "x", true)).error);
}

// ───────── the doors are locked ─────────
{
  const actions = read("app/admin/actions.ts");
  const fns = actions.split(/export async function /).slice(1);
  t("actions: the admin actions exist (cancel, reinstate, review)", fns.length === 3, String(fns.length));
  t("actions: every one checks the caller is an admin before doing anything", fns.every((f) => /const a = await admin\(\);\s*\n\s*if \("error" in a\) return/.test(f)), fns.map((f) => f.split("(")[0]).join());
  t("actions: the gate checks the verified admin login, then needs the server key", /getAdminUser\(\)/.test(actions) && actions.indexOf("getAdminUser()") < actions.indexOf("createAdminClient()"));
  t("actions: the database client is created only inside that gate", (actions.match(/createAdminClient\(\)/g) ?? []).length === 1);
  const page = read("app/admin/page.tsx");
  t("page: it asks who you are before reading any data", page.indexOf("getAdminUser()") > -1 && page.indexOf("getAdminUser()") < page.indexOf("createAdminClient()") && page.indexOf("getAdminUser()") < page.indexOf("loadStats("));
  t("page: a non-admin gets a plain 404 (it doesn't reveal that the page exists)", /if \(!\(await getAdminUser\(\)\)\) notFound\(\)/.test(page) || /if \(!user\) notFound\(\)/.test(page));
  t("page: it is never cached or indexed", /dynamic = "force-dynamic"/.test(page) && /index: false/.test(page));
  const data = read("lib/admin-data.ts");
  t("data: it never reads emails, birthdays, addresses or private notes", !/auth\.admin|profile_private|birth_date|event_locations|rsvp_notes|profile_bios|\bemail\b/.test(data.replace(/\/\/.*$/gm, "")));
}

// ───────── the report email and the link from "Me" ─────────
{
  const m = buildReportEmail({ eventId: UUID(2), eventTitle: "100% fun run", hostName: "Host Two", reason: "Spam or scam", details: "looks\nfake", reporterEmail: "r1@example.com" });
  t("report email: links to the admin page's reports", /\/admin\?tab=reports/.test(m.text));
  t("report email: still links to the meetup, and keeps the SQL way as a fallback", m.text.includes(`/events/${UUID(2)}`) && m.text.includes(`update public.events set cancelled_at = now() where id = '${UUID(2)}'`));
  t("report email: plain text, and a multi-line detail can't fake extra lines in the header fields", !/<[a-z]/i.test(m.text) && m.text.split("\n").filter((l) => l.startsWith("Details:")).length === 1);
  const me = read("app/me/page.tsx");
  t("Me: the admin link only shows for verified admins", /isAdminUser\(user\) && \(\s*\n\s*<Link href="\/admin"/.test(me));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
