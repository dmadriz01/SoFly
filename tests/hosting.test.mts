// Host recognition: the record, the summary, and the morning-after wrap-up. `npm run test:unit`.
import fs from "node:fs";
import path from "node:path";
import { hostRecap } from "../lib/email-templates.ts";
import { cameBackText, summarizeHosting } from "../lib/engagement.ts";
import { hostStats } from "../lib/host-stats.ts";
import { sendDailyEmails } from "../lib/notify.ts";
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
const rec = () => { const sent: { to: string; title: string; body: string; url: string }[] = []; return { sent, push: async (to: string, p: { title: string; body: string; url: string }) => { sent.push({ to, title: p.title, body: p.body, url: p.url }); return { sent: 1, removed: 0, failed: 0 }; } }; };

// ───────── the record ─────────
{
  const past = [{ spots_taken: 6, feedback_yes: 3, feedback_total: 4 }, { spots_taken: 4, feedback_yes: 1, feedback_total: 1 }];
  const exact = summarizeHosting(past, { hosted: 2, guests: 8, repeatGuests: 3 });
  t("record: with the database's numbers it uses them, and says they're exact", exact.hosted === 2 && exact.guests === 8 && exact.repeatGuests === 3 && exact.exact === true);
  t("record: the 'would join again' answers are added up from the past meetups either way", exact.feedbackYes === 4 && exact.feedbackTotal === 5 && summarizeHosting(past, null).feedbackTotal === 5);
  const fallback = summarizeHosting(past, null);
  t("record: before the database update it counts from the meetups themselves, and can't say who came back", fallback.hosted === 2 && fallback.guests === 10 && fallback.repeatGuests === 0 && fallback.exact === false);
  t("record: no meetups yet is all zeros", summarizeHosting([], null).hosted === 0 && summarizeHosting([], { hosted: 0, guests: 0, repeatGuests: 0 }).guests === 0);
  t("record: wording for people who came back", cameBackText(0) === null && cameBackText(1) === "1 came back" && cameBackText(9) === "9 came back");
  const rpc = (result: unknown) => ({ rpc: async () => result }) as never;
  t("stats from the database: the usual answer (a list with one row)", JSON.stringify(await hostStats(rpc({ data: [{ hosted: 5, guests: 20, repeat_guests: 6 }], error: null }), "h")) === JSON.stringify({ hosted: 5, guests: 20, repeatGuests: 6 }));
  t("stats from the database: a single row works too", (await hostStats(rpc({ data: { hosted: 1, guests: 2, repeat_guests: 0 }, error: null }), "h"))?.guests === 2);
  t("stats from the database: an error, nothing, or nonsense gives null (so the page falls back to its own count)", (await hostStats(rpc({ data: null, error: { code: "PGRST202" } }), "h")) === null && (await hostStats(rpc({ data: null, error: null }), "h")) === null && (await hostStats(rpc({ data: [], error: null }), "h")) === null && (await hostStats(rpc({ data: [{ hosted: "x" }], error: null }), "h")) === null);
}

// ───────── the morning-after wrap-up ─────────
const users = { host: { email: "host@example.com" }, ann: { email: "ann@example.com" }, bob: { email: "bob@example.com" }, cy: { email: "cy@example.com" }, dee: { email: "dee@example.com" } };
const NOW = new Date("2026-09-21T16:00:00Z"); // Monday 9 AM Pacific
const wrap = (): FakeData => ({
  events: [
    { id: "old", title: "Earlier run", starts_at: "2026-09-07T01:30:00Z", host_id: "host", join_mode: "open", cancelled_at: null, category: "Running", neighborhood: "Oakland", venue_name: "P", address: "1" },
    { id: "cancelled-old", title: "Cancelled", starts_at: "2026-09-10T01:30:00Z", host_id: "host", join_mode: "open", cancelled_at: "2026-09-09T00:00:00Z", category: "Running", neighborhood: "Oakland", venue_name: "P", address: "1" },
    { id: "last", title: "Sunday run", starts_at: "2026-09-21T02:00:00Z", host_id: "host", join_mode: "open", cancelled_at: null, category: "Running", neighborhood: "Oakland", venue_name: "P", address: "1" }, // Sunday 7 PM: yesterday
  ],
  rsvps: [
    { event_id: "old", user_id: "host", status: "approved" }, { event_id: "old", user_id: "ann", status: "approved" }, { event_id: "old", user_id: "dee", status: "pending" },
    { event_id: "cancelled-old", user_id: "bob", status: "approved" },
    { event_id: "last", user_id: "host", status: "approved" }, { event_id: "last", user_id: "ann", status: "approved" }, { event_id: "last", user_id: "bob", status: "approved" }, { event_id: "last", user_id: "cy", status: "approved" }, { event_id: "last", user_id: "dee", status: "pending" },
  ],
  profiles: [{ id: "host", name: "Hana Host" }, { id: "ann", name: "Ann Lee" }, { id: "bob", name: "Bob Ray" }, { id: "cy", name: "Cy Ng" }, { id: "dee", name: "Dee Fox" }],
  user_settings: [], notification_log: [],
});
const run = async (d: FakeData, opts: Record<string, unknown> = {}) => { const box = fakeMailbox(); const r = rec(); const res = await silently(() => sendDailyEmails(NOW, { admin: fakeAdmin(d, users, opts), send: box.send, push: r.push })); return { res, box, r, mail: box.sent.find((m) => m.to === "host@example.com" && /came to/.test(m.subject)), push: r.sent.find((p) => p.to === "host" && /came to/.test(p.title)) }; };
{
  const d = wrap(); const { res, mail, push } = await run(d);
  t("wrap-up: the host of yesterday's meetup gets an email and a push saying how many came", !!mail && !!push && res.hostRecaps === 1 && /3 people came to Sunday run/.test(mail.subject), mail?.subject);
  t("wrap-up: it counts approved guests only: not the host, not someone whose request was pending", /3 people came/.test(mail!.subject) && !/4 people/.test(mail!.text));
  t("wrap-up: it says how many had been to an earlier meetup of theirs (Ann came to the earlier run; a cancelled one and a pending request don't count)", /1 of them had been to one of your meetups before/.test(mail!.text), mail?.text);
  t("wrap-up: it nudges them to post the next one, copying this meetup", /Post the next one/.test(mail!.text) && /events\/new\?from=last/.test(mail!.text) && push!.url === "/events/new?from=last");
  t("wrap-up: it's recorded, so running the job twice never sends it twice", d.notification_log.some((x) => x.kind === "host_recap" && x.ref === "last" && x.user_id === "host"));
  const again = await run(d);
  t("wrap-up: ...a second run sends nothing more", !again.mail && again.res.hostRecaps === 0);
  t("wrap-up: guests are unaffected, they still get 'How was it?' (and their recap)", res.feedbackRequests === 3);
}
{
  const d = wrap(); d.rsvps = d.rsvps.filter((r) => r.event_id !== "last" || r.user_id === "host");
  t("wrap-up: a meetup nobody came to gets no wrap-up", !(await run(d)).mail);
  const c = wrap(); (c.events[2] as { cancelled_at: unknown }).cancelled_at = "2026-09-20T00:00:00Z";
  t("wrap-up: a cancelled meetup gets none", !(await run(c)).mail);
  const f = wrap(); f.rsvps = f.rsvps.filter((r) => r.event_id === "last");
  t("wrap-up: with no earlier meetups nobody 'came back' (and it doesn't say so)", !/before/.test((await run(f)).mail!.text));
  const off = wrap(); off.user_settings = [{ user_id: "host", notify_activity: false }];
  const o = await run(off);
  t("wrap-up: a host who switched 'Activity on my meetups' off doesn't get it (and it's counted)", !o.mail && !o.push && o.res.mutedByPrefs >= 1);
  const q = wrap(); q.user_settings = [{ user_id: "host", quiet_start: 8, quiet_end: 10 }];
  const qq = await run(q);
  t("wrap-up: in quiet hours the email goes, the push waits", !!qq.mail && !qq.push);
  const cap = wrap(); cap.notification_log = [1, 2, 3].map((i) => ({ user_id: "host", kind: "digest", ref: `r${i}`, created_at: new Date(NOW.getTime() - 3600000).toISOString() }));
  const cc = await run(cap);
  t("wrap-up: past the daily nudge limit the email still goes, but no extra push", !!cc.mail && !cc.push);
  const e = wrap(); e.user_settings = [{ user_id: "host", email_notifications: false }];
  const ee = await run(e);
  t("wrap-up: with the master email switch off, just the push", !ee.mail && !!ee.push);
  const broken = await run(wrap(), { logError: true });
  t("wrap-up: if the send log is unavailable, it isn't sent (fails safe)", !broken.mail && !broken.push && broken.res.hostRecaps === 0);
  const one = wrap(); one.rsvps = one.rsvps.filter((r) => r.event_id !== "last" || r.user_id === "host" || r.user_id === "cy");
  t("wrap-up: one person is 'person', not 'people'", /1 person came to Sunday run/.test((await run(one)).mail!.subject));
  const evil = hostRecap({ name: "H", eventTitle: "<script>alert(1)</script>", came: 2, cameBack: 0, nextUrl: "https://s/n", eventUrl: "https://s/e", siteUrl: "https://s" });
  t("wrap-up: a title with markup in it is escaped", !evil.html.includes("<script>") && evil.html.includes("&lt;script&gt;"));
}

// ───────── the screens ─────────
{
  const page = read("app/events/[id]/page.tsx");
  t("meetup page: the host's record comes from the database when it can, with our own count as the fallback", /summarizeHosting\(/.test(page) && /await hostStats\(supabase, event\.host_id\)/.test(page) && /cameBack=\{record\.repeatGuests\}/.test(page));
  const card = read("components/HostCard.tsx");
  t("host card: it adds '· N came back' only when someone did", /cameBack > 0 \? ` · \$\{cameBack\} came back` : ""/.test(card));
  const me = read("app/me/page.tsx");
  t("Me: hosts get a summary of their own record, from their own past, uncancelled meetups", /<HostingSummary summary=\{hostingSummary\} lastEventId=\{lastHosted\?\.id \?\? null\} \/>/.test(me) && /!e\.cancelled_at && new Date\(e\.starts_at\)\.getTime\(\) < Date\.now\(\)/.test(me));
  const sum = read("components/HostingSummary.tsx");
  t("summary: nothing to show until they've hosted; the 'would join again' figure needs 3+ answers; 'came back' only when exact", /summary\.hosted === 0\) return null/.test(sum) && /feedbackTotal >= 3/.test(sum) && /summary\.exact && figure\(/.test(sum));
  t("summary: it offers to post the next one by copying the last", /events\/new\?from=\$\{lastEventId\}/.test(sum));
  const notify = read("lib/notify.ts");
  t("wrap-up: it's claimed before sending, and only counts guests who came to an EARLIER meetup of that host", notify.indexOf('claimSend(admin, event.host_id, "host_recap"') < notify.indexOf("email.hostRecap") && /\.lt\("starts_at", event\.starts_at\)/.test(notify));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
