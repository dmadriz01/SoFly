// The moment after a meetup: "you met N people", similar meetups, and the doors. `npm run test:unit`.
import fs from "node:fs";
import path from "node:path";
import { feedbackRequest } from "../lib/email-templates.ts";
import { metCount } from "../lib/engagement.ts";
import { sendDailyEmails } from "../lib/notify.ts";
import { loadPool, picksFor } from "../lib/picks.ts";
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

// ───────── how many people they met ─────────
{
  t("met: everyone but you", metCount(["a", "b", "c"], "a", "h") === 3 && metCount(["a", "b"], "z", "h") === 3);
  t("met: the host counts once, whether or not they have a guest row", metCount(["h", "a", "b"], "a", "h") === 2 && metCount(["a", "b"], "a", "h") === 2);
  t("met: repeated ids count once", metCount(["a", "b", "b", "b"], "a", "h") === 2);
  t("met: a host looking at their own meetup doesn't count themselves", metCount(["h", "a", "b"], "h", "h") === 2);
  t("met: an empty list is just the host (or nobody, if it's you)", metCount([], "a", "h") === 1 && metCount([], "h", "h") === 0);
}

// ───────── the email ─────────
{
  const plain = feedbackRequest({ name: "Ana", eventTitle: "Sunset run", eventUrl: "https://s/e1", siteUrl: "https://s" });
  t("email: with no extras it reads exactly as it always did", /Hi Ana, thanks for joining\. Would you join a meetup like this again\?/.test(plain.text) && !/spent it with/.test(plain.text) && !/coming up/.test(plain.text) && plain.subject === "How was Sunset run?");
  const rich = feedbackRequest({ name: "Ana", eventTitle: "Sunset run", eventUrl: "https://s/e1", siteUrl: "https://s", metCount: 6, similar: [{ title: "Sunrise run", when: "Sat, Sep 26 · 7:00 AM", place: "Oakland", url: "https://s/events/2" }, { title: "Trail loop", when: "Sun, Sep 27 · 9:00 AM", place: "Berkeley", url: "https://s/events/3" }] });
  t("email: it adds a warm recap and what's coming up, with links", /You spent it with 6 other people\./.test(rich.text) && /coming up/.test(rich.text) && /Sunrise run: Sat, Sep 26 · 7:00 AM, Oakland\. https:\/\/s\/events\/2/.test(rich.text) && /Trail loop/.test(rich.text));
  t("email: one person is 'other person', and zero people adds no recap", /1 other person\./.test(feedbackRequest({ name: "A", eventTitle: "T", eventUrl: "u", siteUrl: "s", metCount: 1 }).text) && !/spent it with/.test(feedbackRequest({ name: "A", eventTitle: "T", eventUrl: "u", siteUrl: "s", metCount: 0 }).text));
  const evil = feedbackRequest({ name: "A", eventTitle: "T", eventUrl: "u", siteUrl: "s", similar: [{ title: "<script>alert(1)</script>", when: "now", place: "<b>x</b>", url: "https://s/e" }] });
  t("email: anything typed in a title is escaped in the HTML version", !evil.html.includes("<script>") && !evil.html.includes("<b>x</b>") && evil.html.includes("&lt;script&gt;"));
}

// ───────── the day-after job ─────────
const users = { host: { email: "host@example.com" }, ann: { email: "ann@example.com" }, bob: { email: "bob@example.com" }, cy: { email: "cy@example.com" } };
const NOW = new Date("2026-09-21T16:00:00Z"); // Monday 9 AM Pacific; "yesterday" is Sunday Sep 20
const ev = (id: string, o: Record<string, unknown> = {}) => ({ id, title: id, category: "Running", neighborhood: "Oakland", starts_at: "2026-09-24T16:00:00Z", host_id: "host", join_mode: "open", venue_name: "Park", address: "1 Main", cancelled_at: null, max_spots: 8, spots_taken: 2, audience: "Everyone", age_min: null, age_max: null, series_id: null, ...o });
const dayAfter = (): FakeData => ({
  events: [
    ev("went", { starts_at: "2026-09-21T02:00:00Z", category: "Running", neighborhood: "Oakland" }), // Sunday 7 PM Pacific
    ev("next-run"), ev("next-yoga", { category: "Yoga", neighborhood: "SF - Mission" }), ev("womens", { audience: "Women-only" }), ev("full", { spots_taken: 8 }), ev("thirty", { age_min: 30 }), ev("joined-already"), ev("far", { starts_at: "2026-10-20T16:00:00Z" }),
  ],
  rsvps: [
    { event_id: "went", user_id: "host", status: "approved" }, { event_id: "went", user_id: "ann", status: "approved" }, { event_id: "went", user_id: "bob", status: "approved" }, { event_id: "went", user_id: "cy", status: "approved" },
    { event_id: "joined-already", user_id: "ann", status: "approved" },
  ],
  profiles: [{ id: "host", name: "Host" }, { id: "ann", name: "Ann Lee" }, { id: "bob", name: "Bob Ray" }, { id: "cy", name: "Cy Ng" }],
  profile_private: [{ user_id: "ann", birth_date: "2000-01-01" }],
  user_settings: [], notification_log: [],
});
{
  const box = fakeMailbox(); const r = rec();
  const res = await silently(() => sendDailyEmails(NOW, { admin: fakeAdmin(dayAfter(), users), send: box.send, push: r.push }));
  const ann = box.sent.find((m) => m.to === "ann@example.com" && /How was/.test(m.subject))!;
  t("recap: each guest still gets the 'How was it?' email and push (the host doesn't)", res.feedbackRequests === 3 && box.sent.filter((m) => /How was/.test(m.subject)).length === 3 && !box.sent.some((m) => m.to === "host@example.com" && /How was/.test(m.subject)));
  t("recap: it says how many others were there (the two other guests and the host: 3)", /You spent it with 3 other people/.test(ann.text), ann.text);
  t("recap: the push says it too", r.sent.some((p) => p.to === "ann" && /You met 3 people/.test(p.body)), JSON.stringify(r.sent.filter((p) => p.to === "ann")));
  t("recap: similar meetups are suggested, the same kind first", /next-run/.test(ann.text) && /next-yoga/.test(ann.text) && ann.text.indexOf("next-run") < ann.text.indexOf("next-yoga"));
  t("recap: but never a full one, women-only, age-limited for her, one she's already joined, or one too far ahead", !/womens|thirty|joined-already|far\b/.test(ann.text) && !/(^|\W)full(\W|$)/.test(ann.text.replace(/spent it/g, "")));
  t("recap: the meetup they just went to isn't suggested again", !/went[^\n]*https/.test(ann.text.split("coming up")[1] ?? ""));
  const bobMail = box.sent.find((m) => m.to === "bob@example.com" && /How was/.test(m.subject))!;
  t("recap: someone with no birth date on file still gets sensible suggestions", /next-run/.test(bobMail.text) && /thirty/.test(bobMail.text));
}
{
  const d = dayAfter(); d.events = d.events.filter((e) => e.id === "went");
  const box = fakeMailbox();
  await silently(() => sendDailyEmails(NOW, { admin: fakeAdmin(d, users), send: box.send, push: rec().push }));
  const m = box.sent.find((x) => /How was/.test(x.subject))!;
  t("recap: with nothing similar coming up, the message is just the thanks and the recap (no empty list)", !!m && /spent it with/.test(m.text) && !/coming up/.test(m.text));
}
{
  // choosing suggestions must never stop the message going out
  const d = dayAfter(); const inner = fakeAdmin(d, users);
  const admin = { ...inner, from: (table: string) => { if (table === "profile_private") throw new Error("boom"); return (inner as unknown as { from: (t: string) => unknown }).from(table); }, auth: (inner as unknown as { auth: unknown }).auth } as never;
  const box = fakeMailbox(); const errs: unknown[] = []; const orig = console.error; console.error = (...a: unknown[]) => errs.push(a);
  const res = await silently(() => sendDailyEmails(NOW, { admin, send: box.send, push: rec().push }));
  console.error = orig;
  t("recap: if picking similar meetups fails, the 'How was it?' message still goes out (without the list), and the problem is logged", res.feedbackRequests === 3 && box.sent.filter((m) => /How was/.test(m.subject)).length === 3 && !box.sent.some((m) => /coming up/.test(m.text)) && errs.length >= 1);
}
{
  const d = dayAfter(); d.user_settings = [{ user_id: "ann", notify_reminders: false }];
  const box = fakeMailbox(); const r = rec();
  const res = await silently(() => sendDailyEmails(NOW, { admin: fakeAdmin(d, users), send: box.send, push: r.push }));
  t("recap: someone who switched Reminders off isn't asked (the others still are)", !box.sent.some((m) => m.to === "ann@example.com" && /How was/.test(m.subject)) && !r.sent.some((p) => p.to === "ann" && /How was/.test(p.title)) && res.feedbackRequests === 2);
}

// ───────── the shared picking ─────────
{
  const now = new Date("2026-09-21T16:00:00Z");
  const d = dayAfter(); const admin = fakeAdmin(d, users);
  const pool = await loadPool(admin, now, 14);
  t("pool: only upcoming, uncancelled meetups inside the window, with the free spots worked out", pool.some((c) => c.id === "next-run" && c.spots_left === 6) && !pool.some((c) => c.id === "far" || c.id === "went"), pool.map((c) => c.id).join());
  const picks = await picksFor(admin, "ann", pool, { categories: ["Running"], neighborhoods: [] }, { now, withinDays: 14, limit: 3 });
  t("picks: they skip what you've joined, what's full or restricted for you, and respect the limit", !picks.some((c) => ["joined-already", "full", "womens", "thirty"].includes(c.id)) && picks.length <= 3 && picks[0].id === "next-run", picks.map((c) => c.id).join());
  const hosted = await picksFor(admin, "host", pool, { categories: ["Running"], neighborhoods: [] }, { now, withinDays: 14, limit: 5 });
  t("picks: a host is never told to join their own meetups", hosted.length === 0, hosted.map((c) => c.id).join());
  const extra = await picksFor(admin, "bob", pool, { categories: ["Running"], neighborhoods: [] }, { now, withinDays: 14, limit: 5, alsoExclude: ["next-run"] });
  t("picks: a meetup can be excluded on top (the one they just came from)", !extra.some((c) => c.id === "next-run"));
  t("picks: an empty pool gives nothing and asks the database nothing", (await picksFor(admin, "ann", [], { categories: [], neighborhoods: [] }, { now, withinDays: 14, limit: 3 })).length === 0);
}

// ───────── the screens and doors ─────────
{
  const actions = read("app/actions.ts");
  const sim = actions.slice(actions.indexOf("export async function getSimilarMeetups"), actions.indexOf("export async function submitFeedback"));
  t("similar meetups (in-app): needs a login and only works for someone who actually went (approved), otherwise returns nothing", /getUser\(\)/.test(sim) && /went\?\.status !== "approved"\) return \{ items: \[\] \}/.test(sim));
  t("similar meetups (in-app): uses the shared picking with the person's own access, and leaves out the meetup they came from", /loadPool\(supabase/.test(sim) && /picksFor\(supabase/.test(sim) && /alsoExclude: \[eventId\]/.test(sim));
  const prompt = read("components/FeedbackPrompt.tsx");
  t("feedback card: the 'keep it going' list appears only after a successful answer, once", /if \(result\.error\) \{[\s\S]{0,120}return;\s*\n\s*\}/.test(prompt) && /if \(similar === null\)/.test(prompt) && /getSimilarMeetups\(eventId\)/.test(prompt));
  t("feedback card: a failure fetching suggestions just shows none, never an error", /catch \{\s*\n\s*setSimilar\(\[\]\)/.test(prompt));
  t("feedback card: 'You spent it with N other people' is shown only when there's someone", /met !== undefined && met > 0/.test(prompt));
  t("Me and the meetup page: the recap number comes from guest lists the person is allowed to see", /metByEvent/.test(read("app/me/page.tsx")) && /\.eq\("status", "approved"\)\.in\("event_id", toRate/.test(read("app/me/page.tsx")) && /metCount\(attendees\.map/.test(read("app/events/[id]/page.tsx")));
  const notify = read("lib/notify.ts");
  t("the daily job: a failure choosing suggestions is caught so it can't stop the message", /try \{\s*\n\s*const taste[\s\S]{0,400}\} catch \(err\) \{\s*\n\s*console\.error\("Couldn't pick similar meetups/.test(notify));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
