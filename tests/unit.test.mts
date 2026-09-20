// Unit tests for the pure logic (no network, no database). Run with `npm run test:unit`.
// Uses Node's built-in TypeScript support, so it needs Node 22.6 or newer.
import { ageFieldProblem, ageLabel, ageOn, parseBirthDate, resolveAgeRange, withinAgeRange } from "../lib/age.ts";
import { aboutLinks, hasAbout, parseAbout } from "../lib/about.ts";
import { parseChatUrl } from "../lib/chat.ts";
import { parseHandle, socialUrl } from "../lib/social.ts";
import * as email from "../lib/email-templates.ts";
import { buildIcs } from "../lib/ics.ts";
import { updateOrInsert } from "../lib/supabase/save.ts";
import { validateEvent, validateRequestNote } from "../lib/validation.ts";
import { addDaysToKey, pacificDate, pacificLocalToUtc } from "../lib/time.ts";

let passed = 0;
let failed = 0;
const t = (name: string, cond: boolean, extra = "") => {
  cond ? passed++ : failed++;
  console.log(`${cond ? "ok   " : "FAIL "}${name}${cond ? "" : "  -> " + extra}`);
};

// ---- ages ----
t("turns 21 on the day", ageOn("2000-09-20", "2021-09-20") === 21);
t("day before the 21st birthday", ageOn("2000-09-20", "2021-09-19") === 20);
t("leap day, Feb 28", ageOn("2000-02-29", "2025-02-28") === 24);
t("leap day, Mar 1", ageOn("2000-02-29", "2025-03-01") === 25);
t("Feb 30 rejected", parseBirthDate("1995", "2", "30") === null);
t("Feb 29 in a non-leap year rejected", parseBirthDate("2001", "2", "29") === null);
t("valid birthday", parseBirthDate("1995", "7", "4") === "1995-07-04");
t("age ranges include both ends", withinAgeRange(21, 18, 21) && withinAgeRange(21, 21, 25) && !withinAgeRange(22, 18, 21));
t("age labels", ageLabel(null, null) === null && ageLabel(21, null) === "21+" && ageLabel(21, 25) === "21–25");

// ---- custom age ranges ----
const range = (a: string, b: string) => JSON.stringify(resolveAgeRange(a, b));
t("ages: both blank = no restriction", range("", "") === '{"min":null,"max":null}');
t("ages: from only", range("21", "") === '{"min":21,"max":null}');
t("ages: 'from 18' with no limit is the same as none", range("18", "") === '{"min":null,"max":null}');
t("ages: to only starts at 18", range("", "30") === '{"min":18,"max":30}');
t("ages: any custom range", range("27", "34") === '{"min":27,"max":34}');
t("ages: 18 to 30 is kept", range("18", "30") === '{"min":18,"max":30}');
t("ages: whitespace is ignored", range(" 25 ", " 35 ") === '{"min":25,"max":35}');
t("age field: blank is fine", ageFieldProblem("") === undefined && ageFieldProblem("  ") === undefined);
t("age field: 18 and 120 are fine", ageFieldProblem("18") === undefined && ageFieldProblem("120") === undefined);
t("age field: 17, 121, text and decimals are rejected", ["17", "121", "abc", "25.5", "-30"].every((v) => ageFieldProblem(v) !== undefined));
{
  const good = { title: "Run", category: "Running", neighborhood: "Oakland", venue_name: "Park", address: "1 Main St", starts_at: "2030-01-01T10:00", max_spots: "10", description: "", chat_url: "", skill_level: "All levels", audience: "Everyone", age_min: "", age_max: "", join_mode: "open" };
  const errs = (o: Record<string, string>) => validateEvent({ ...good, ...o });
  t("form: a normal event has no errors", Object.keys(errs({})).length === 0, JSON.stringify(errs({})));
  t("form: ages 25 to 35 are accepted", Object.keys(errs({ age_min: "25", age_max: "35" })).length === 0);
  t("form: only a minimum is accepted", Object.keys(errs({ age_min: "30" })).length === 0);
  t("form: only a maximum is accepted", Object.keys(errs({ age_max: "40" })).length === 0);
  t("form: an oldest age below the youngest is rejected", "age_max" in errs({ age_min: "30", age_max: "25" }));
  t("form: the same age for both is allowed", Object.keys(errs({ age_min: "30", age_max: "30" })).length === 0);
  t("form: under 18 is rejected", "age_min" in errs({ age_min: "17" }));
  t("form: a non-number is rejected", "age_max" in errs({ age_max: "old" }));
  t("form: Everyone, Women-only and Men-only are all valid", ["Everyone", "Women-only", "Men-only"].every((a) => !("audience" in errs({ audience: a }))));
  t("form: any other audience is rejected", "audience" in errs({ audience: "Nonbinary-only" }));
}

// ---- social usernames: a username in, a safe link out ----
const handle = (k: Parameters<typeof parseHandle>[0], v: string) => { const r = parseHandle(k, v); return "handle" in r ? r.handle : "ERROR"; };
t("social: a plain username is kept", handle("instagram", "ann.lee") === "ann.lee");
t("social: a leading @ is dropped", handle("instagram", "@ann.lee") === "ann.lee" && handle("x", "@annlee") === "annlee");
t("social: blank means none", handle("instagram", "") === null && handle("tiktok", "   ") === null);
t("social: an Instagram link becomes the username", handle("instagram", "https://www.instagram.com/ann.lee/?hl=en") === "ann.lee");
t("social: a link without https:// works too", handle("instagram", "instagram.com/ann.lee") === "ann.lee");
t("social: a LinkedIn profile link becomes the slug", handle("linkedin", "https://www.linkedin.com/in/ann-lee-a1b2c3/?trk=abc") === "ann-lee-a1b2c3");
t("social: the bare LinkedIn slug is accepted", handle("linkedin", "ann-lee-a1b2c3") === "ann-lee-a1b2c3");
t("social: LinkedIn pages that aren't personal profiles are refused", handle("linkedin", "https://www.linkedin.com/company/acme") === "ERROR");
t("social: an X link on either domain works", handle("x", "https://x.com/annlee") === "annlee" && handle("x", "https://twitter.com/annlee") === "annlee");
t("social: a TikTok link keeps the name without the @", handle("tiktok", "https://www.tiktok.com/@ann_lee") === "ann_lee");
t("social: a mobile Facebook link works", handle("facebook", "https://m.facebook.com/ann.lee") === "ann.lee");
t("social: another site's link is refused, however it's dressed up", ["https://evil.com/ann", "https://instagram.com.evil.com/ann", "https://evilinstagram.com/ann", "https://user:pw@instagram.com/ann", "javascript:alert(1)"].every((u) => handle("instagram", u) === "ERROR"));
t("social: a link to the wrong app is refused", handle("instagram", "https://x.com/annlee") === "ERROR" && handle("linkedin", "https://instagram.com/ann") === "ERROR");
t("social: spaces, slashes and markup are refused", ["ann lee", "ann/lee", "<b>ann</b>", "ann;drop", "a".repeat(61)].every((u) => handle("instagram", u) === "ERROR"));
t("social: the link is built from a fixed address", socialUrl("instagram", "ann.lee") === "https://www.instagram.com/ann.lee" && socialUrl("linkedin", "ann-lee") === "https://www.linkedin.com/in/ann-lee" && socialUrl("tiktok", "ann_lee") === "https://www.tiktok.com/@ann_lee");
t("social: even a stored oddity can't break out of the address", socialUrl("instagram", "a/../b") === "https://www.instagram.com/a%2F..%2Fb");
{
  const blank = { bio: "", linkedin: "", instagram: "", x: "", tiktok: "", facebook: "" };
  const ok1 = parseAbout({ ...blank, bio: "  Designer.  ", instagram: "https://instagram.com/ann.lee", x: "@annlee" });
  t("about: bio is trimmed and links become usernames", ok1.ok && ok1.value.bio === "Designer." && ok1.value.instagram === "ann.lee" && ok1.value.x_handle === "annlee" && ok1.value.linkedin === null);
  t("about: an empty form is fine", parseAbout(blank).ok);
  const bad = parseAbout({ ...blank, bio: "x".repeat(501), instagram: "https://evil.com/x" });
  t("about: a long bio and a bad link are both reported", !bad.ok && "bio" in bad.errors && "instagram" in bad.errors);
  t("about: links come out in a fixed order with real addresses", ok1.ok && aboutLinks(ok1.value).map((l) => l.label).join() === "Instagram,X" && aboutLinks(ok1.value)[0].url === "https://www.instagram.com/ann.lee");
  t("about: 'has a profile' means a bio or a link", ok1.ok && hasAbout(ok1.value) && !hasAbout(null) && !hasAbout({ bio: " ", linkedin: null, instagram: null, x_handle: null, tiktok: null, facebook: null }));
}

// ---- the note to the host is optional ----
t("note: empty is fine (the host sees your profile anyway)", validateRequestNote("") === undefined && validateRequestNote("   ") === undefined);
t("note: a short note is fine", validateRequestNote("Hi!") === undefined);
t("note: 500 characters is fine, 501 is not", validateRequestNote("x".repeat(500)) === undefined && validateRequestNote("x".repeat(501)) !== undefined);

// ---- chat links (only known apps; no look-alike hosts) ----
t("WhatsApp link accepted", "url" in parseChatUrl("https://chat.whatsapp.com/AbC123"));
t("scheme added when missing", parseChatUrl("chat.whatsapp.com/AbC123").hasOwnProperty("url"));
t("http rejected", "error" in parseChatUrl("http://chat.whatsapp.com/x"));
t("user@host trick rejected", "error" in parseChatUrl("https://chat.whatsapp.com@evil.com/x"));
t("look-alike suffix rejected", "error" in parseChatUrl("https://chat.whatsapp.com.evil.com/x"));
t("unknown site rejected", "error" in parseChatUrl("https://example.com"));

// ---- Pacific dates and the reminder window ----
t("Pacific summer time", pacificLocalToUtc("2026-09-20T18:30")?.toISOString() === "2026-09-21T01:30:00.000Z");
t("Pacific winter time", pacificLocalToUtc("2026-12-20T18:30")?.toISOString() === "2026-12-21T02:30:00.000Z");
t("a time that doesn't exist (spring forward) is rejected", pacificLocalToUtc("2027-03-14T02:30") === null);
t("adding days across a month", addDaysToKey("2026-09-30", 1) === "2026-10-01");
t("adding days across a year", addDaysToKey("2026-12-31", 1) === "2027-01-01");
{
  // The day daylight saving ends is 25 hours long; tomorrow's window must still be exactly that day.
  const tomorrow = addDaysToKey(pacificDate(new Date("2026-10-31T16:00:00Z")), 1);
  const from = pacificLocalToUtc(`${tomorrow}T00:00`)!;
  const to = pacificLocalToUtc(`${addDaysToKey(tomorrow, 1)}T00:00`)!;
  t("reminder window on the fall-back day is 25 hours", tomorrow === "2026-11-01" && (to.getTime() - from.getTime()) / 3.6e6 === 25);
}
{
  const tomorrow = addDaysToKey(pacificDate(new Date("2027-03-13T16:00:00Z")), 1);
  const from = pacificLocalToUtc(`${tomorrow}T00:00`)!;
  const to = pacificLocalToUtc(`${addDaysToKey(tomorrow, 1)}T00:00`)!;
  t("...and 23 hours on the spring-forward day", tomorrow === "2027-03-14" && (to.getTime() - from.getTime()) / 3.6e6 === 23);
}

// ---- calendar file ----
{
  const ics = buildIcs({
    id: "abc-123",
    title: 'Run; around, the "lake"',
    start: new Date("2026-09-20T02:00:00Z"),
    location: "Lake Merritt, 1 Lakeside Dr, Oakland, CA",
    description: "Line one\nLine two, with; punctuation and a very long sentence that must be folded because it is longer than seventy-five octets.",
    url: "https://example.com/events/abc-123",
    cancelled: false,
  });
  const lines = ics.split("\r\n");
  t("calendar: CRLF endings, no bare LF", ics.endsWith("\r\n") && !/[^\r]\n/.test(ics));
  t("calendar: no line over 75 bytes", lines.every((l) => new TextEncoder().encode(l).length <= 75));
  t("calendar: UTC start, 2h end", ics.includes("DTSTART:20260920T020000Z") && ics.includes("DTEND:20260920T040000Z"));
  t("calendar: text escaped", ics.includes('SUMMARY:Run\; around\\, the "lake"'));
  t("calendar: two reminders", (ics.match(/BEGIN:VALARM/g) ?? []).length === 2);
  t("calendar: balanced BEGIN/END", (ics.match(/^BEGIN:/gm) ?? []).length === (ics.match(/^END:/gm) ?? []).length);
}

// ---- emails ----
{
  const evil = `<img src=x onerror=alert(1)>`;
  const e = email.requestReceived({
    hostName: "Sam",
    requesterName: evil,
    eventTitle: `Dinner ${evil}\r\nBcc: x@y.com`,
    eventUrl: "https://example.com/events/1",
    siteUrl: "https://example.com",
  });
  t("email: user text is HTML-escaped", !e.html.includes("<img") && e.html.includes("&lt;img"));
  t("email: subject is a single line", !/[\r\n]/.test(e.subject));
  t("email: has the button link", e.html.includes('href="https://example.com/events/1"') && e.text.includes("https://example.com/events/1"));
  t("email: links to manage settings", e.html.includes("https://example.com/me") && e.text.includes("https://example.com/me"));

  const yes = email.requestDecision({ name: "Ana", eventTitle: "Supper", approved: true, eventUrl: "https://e/1", siteUrl: "https://e" });
  const no = email.requestDecision({ name: "Ana", eventTitle: "Supper", approved: false, eventUrl: "https://e/1", siteUrl: "https://e" });
  t("email: approval says you're in", yes.subject.startsWith("You're in") && yes.text.includes("address"));
  t("email: decline is kind and points elsewhere", no.text.includes("not a judgment") || no.text.includes("That's not a judgment"));
  t("email: decline doesn't leak the event link as the button", no.html.includes('href="https://e"'));

  const c = email.eventCancelled({ name: "Ana", eventTitle: "Run", when: "Saturday at 7:00 PM", eventUrl: "https://e/1", siteUrl: "https://e" });
  t("email: cancellation names the time", c.subject === "Cancelled: Run" && c.text.includes("Saturday at 7:00 PM"));
  const f = email.feedbackRequest({ name: "Ana", eventTitle: "Run", eventUrl: "https://e/1", siteUrl: "https://e" });
  t("email: feedback request is private and one tap", f.subject === "How was Run?" && f.text.includes("private") && f.text.includes("https://e/1"));
  const r = email.reminder({ name: "Ana", eventTitle: "Run", when: "Saturday at 7:00 PM", place: "Lake Merritt", eventUrl: "https://e/1", calendarUrl: "https://e/1/calendar.ics", siteUrl: "https://e" });
  t("email: reminder has when and where", r.subject === "Tomorrow: Run" && r.text.includes("Lake Merritt") && r.text.includes("7:00 PM"));
}

// ---- saving your own rows (update, else insert) ----
{
  const fake = (script: { update: unknown[]; insert: unknown[] }) => {
    const log: string[] = [];
    let u = 0;
    const client = {
      from: () => ({
        update: () => ({ match: () => ({ select: async () => { log.push("update"); return script.update[u++]; } }) }),
        insert: async () => { log.push("insert"); return script.insert.shift(); },
      }),
    };
    return { client: client as never, log };
  };
  const hit = { data: [{ user_id: "1" }], error: null };
  const miss = { data: [], error: null };
  const fail = { data: null, error: { code: "42501", message: "denied" } };

  let f = fake({ update: [hit], insert: [] });
  let r = await updateOrInsert(f.client, "t", { user_id: "1" }, { a: 1 });
  t("save: an existing row is updated, not re-inserted", !r.error && f.log.join() === "update");
  f = fake({ update: [miss], insert: [{ error: null }] });
  r = await updateOrInsert(f.client, "t", { user_id: "1" }, { a: 1 });
  t("save: a missing row is inserted", !r.error && f.log.join() === "update,insert");
  f = fake({ update: [miss, hit], insert: [{ error: { code: "23505", message: "dup" } }] });
  r = await updateOrInsert(f.client, "t", { user_id: "1" }, { a: 1 });
  t("save: losing a race to another insert falls back to an update", !r.error && f.log.join() === "update,insert,update");
  f = fake({ update: [fail], insert: [] });
  r = await updateOrInsert(f.client, "t", { user_id: "1" }, { a: 1 });
  t("save: a database error is reported, not swallowed", Boolean(r.error) && f.log.join() === "update");
  f = fake({ update: [miss], insert: [{ error: { code: "42501", message: "denied" } }] });
  r = await updateOrInsert(f.client, "t", { user_id: "1" }, { a: 1 });
  t("save: an insert error is reported", Boolean(r.error));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
