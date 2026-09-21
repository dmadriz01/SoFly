// Unit tests for the pure logic (no network, no database). Run with `npm run test:unit`.
// Uses Node's built-in TypeScript support, so it needs Node 22.6 or newer.
import { ageFieldProblem, ageLabel, ageOn, parseBirthDate, resolveAgeRange, withinAgeRange } from "../lib/age.ts";
import fs from "node:fs";
import path from "node:path";
import { aboutLinks, hasAbout, parseAbout } from "../lib/about.ts";
import { BRAND, ICON_SIZES, ICON_VERSION, iconUrl } from "../lib/brand.ts";
import { parseChatUrl } from "../lib/chat.ts";
import { parseHandle, socialUrl } from "../lib/social.ts";
import * as email from "../lib/email-templates.ts";
import { buildIcs } from "../lib/ics.ts";
import { updateOrInsert } from "../lib/supabase/save.ts";
import { validateEvent, validateRequestNote } from "../lib/validation.ts";
import { addDaysToKey, pacificDate, pacificLocalToUtc } from "../lib/time.ts";
import { dateRangeKeys, dayLabel, isDateKey, resolveDateFilter, weekDays, weekRangeLabel, weekStartKey } from "../lib/weeks.ts";

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

// ---- browsing by week ----
t("weeks: a Wednesday belongs to the week starting the Monday before", weekStartKey("2026-09-23") === "2026-09-21");
t("weeks: a Monday starts its own week", weekStartKey("2026-09-21") === "2026-09-21");
t("weeks: a Sunday belongs to the week that started six days earlier", weekStartKey("2026-09-27") === "2026-09-21");
t("weeks: across a month and a year", weekStartKey("2027-01-01") === "2026-12-28");
t("weeks: across the fall daylight-saving change (Nov 1, 2026)", weekStartKey("2026-11-01") === "2026-10-26" && weekDays("2026-10-26").map((d) => d.key).join() === "2026-10-26,2026-10-27,2026-10-28,2026-10-29,2026-10-30,2026-10-31,2026-11-01");
t("weeks: across the spring daylight-saving change (Mar 14, 2027)", weekDays(weekStartKey("2027-03-14")).length === 7 && weekDays("2027-03-08")[6].key === "2027-03-14");
t("weeks: seven days, Monday first", weekDays("2026-09-21").map((d) => d.name).join() === "Mon,Tue,Wed,Thu,Fri,Sat,Sun" && weekDays("2026-09-21")[0].day === 21);
t("weeks: labels within a month and across two", weekRangeLabel("2026-09-21") === "Sep 21 – 27" && weekRangeLabel("2026-09-28") === "Sep 28 – Oct 4" && dayLabel("2026-09-21") === "Mon, Sep 21");
t("weeks: only real dates are accepted", isDateKey("2026-09-21") && !isDateKey("2026-02-30") && !isDateKey("2026-13-01") && !isDateKey("tomorrow") && !isDateKey("2026-9-1") && !isDateKey(undefined) && !isDateKey("2026-09-21T00:00"));
{
  const today = "2026-09-23"; // a Wednesday; this week starts 2026-09-21
  const r = (w?: string, d?: string) => JSON.stringify(resolveDateFilter({ week: w, day: d }, today));
  t("filter: nothing given -> no date filter", r() === "{}");
  t("filter: a day picks its week too", r(undefined, "2026-09-25") === '{"week":"2026-09-21","day":"2026-09-25"}');
  t("filter: today is allowed", r(undefined, "2026-09-23") === '{"week":"2026-09-21","day":"2026-09-23"}');
  t("filter: yesterday is not (it's the past)", r(undefined, "2026-09-22") === "{}");
  t("filter: a week is normalized to its Monday", r("2026-09-30") === '{"week":"2026-09-28"}');
  t("filter: the current week is allowed", r("2026-09-21") === '{"week":"2026-09-21"}');
  t("filter: a past week is ignored", r("2026-09-14") === "{}");
  t("filter: more than 26 weeks ahead is ignored", r("2027-09-01") === "{}" && r("2027-03-22") !== "{}");
  t("filter: garbage is ignored, not an error", r("banana", "2026-02-30") === "{}");
  t("filter: a valid day beats a mismatched week", r("2026-10-05", "2026-09-25") === '{"week":"2026-09-21","day":"2026-09-25"}');
  t("filter: bounds for a day and for a week", JSON.stringify(dateRangeKeys({ day: "2026-09-25" })) === '{"from":"2026-09-25","to":"2026-09-26"}' && JSON.stringify(dateRangeKeys({ week: "2026-09-21" })) === '{"from":"2026-09-21","to":"2026-09-28"}' && dateRangeKeys({}) === null);
  // the real bounds, in Pacific time, on the day daylight saving ends
  const day = dateRangeKeys({ day: "2026-11-01" })!;
  const from = pacificLocalToUtc(`${day.from}T00:00`)!;
  const to = pacificLocalToUtc(`${day.to}T00:00`)!;
  t("filter: Nov 1 2026 (clocks go back) is a 25-hour day", (to.getTime() - from.getTime()) / 3.6e6 === 25);
}

// ---- brand colors: readable, and defined in one place ----
{
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const AA = 4.5; // the standard for normal-size text
  t("brand: white text on an accent button is readable", contrast("#ffffff", BRAND.accent) >= AA, contrast("#ffffff", BRAND.accent).toFixed(2));
  t("brand: white text on a hovered (darker) accent button is readable", contrast("#ffffff", BRAND.accentDark) >= AA);
  t("brand: accent-colored text on the page background is readable", contrast(BRAND.accent, BRAND.cream) >= AA, contrast(BRAND.accent, BRAND.cream).toFixed(2));
  t("brand: accent-colored text on white cards is readable", contrast(BRAND.accent, "#ffffff") >= AA);
  t("brand: dark accent text on the soft tint is readable", contrast(BRAND.accentDark, BRAND.accentSoft) >= AA, contrast(BRAND.accentDark, BRAND.accentSoft).toFixed(2));
  t("brand: dark accent text on the page background is readable", contrast(BRAND.accentDark, BRAND.cream) >= AA);
  t("brand: main text on the soft tint is readable", contrast(BRAND.ink, BRAND.accentSoft) >= AA);
  t("brand: accent-colored text on the soft (sand) tint is readable", contrast(BRAND.accent, BRAND.accentSoft) >= AA, contrast(BRAND.accent, BRAND.accentSoft).toFixed(2));
  t("brand: secondary text is readable (4.5:1+) on the page, on white cards and on the sand tint", [BRAND.cream, "#ffffff", BRAND.accentSoft].every((bg) => contrast(BRAND.muted, bg) >= AA), [BRAND.cream, "#ffffff", BRAND.accentSoft].map((bg) => contrast(BRAND.muted, bg).toFixed(2)).join(" / "));
  t("brand: main text is very readable on the page and on white", contrast(BRAND.ink, BRAND.cream) >= 7 && contrast(BRAND.ink, "#ffffff") >= 7);
  t("brand: the border colour is visible against the page background (it must not vanish)", BRAND.line !== BRAND.cream);
  t("brand: the gold letter on the deep-green app icon is legible (3:1+ for large graphics)", contrast(BRAND.gold, BRAND.accentDark) >= 3, contrast(BRAND.gold, BRAND.accentDark).toFixed(2));
  t("brand: gold is too light for text on any light background (that's why it is decoration only)", contrast(BRAND.gold, BRAND.cream) < AA && contrast(BRAND.gold, "#ffffff") < AA);
  // the old orange must not survive anywhere in the source: everything reads from lib/brand.ts
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? (d.name === "node_modules" || d.name === ".next" ? [] : walk(path.join(dir, d.name))) : /\.(ts|tsx|css|mjs)$/.test(d.name) ? [path.join(dir, d.name)] : []));
  const stray = ["app", "components", "lib"].flatMap((d) => walk(path.join(process.cwd(), d))).filter((f) => /d9552f|bd4523|fcebe4|64732c|4a571f|eef1dc|fbf8f3|2b2622|7d726a|ebe2d7/i.test(fs.readFileSync(f, "utf8")));
  t("brand: no hard-coded copy of an old colour (the orange or the olive) is left in the source", stray.length === 0, stray.join(", "));
  // gold is decoration only: it is never used as a text colour anywhere
  const gold = ["app", "components", "lib"].flatMap((d) => walk(path.join(process.cwd(), d))).filter((f) => /\btext-gold\b|text-\[#c49a45\]|color:\s*\$\{BRAND\.gold\}(?![^;]*background)/i.test(fs.readFileSync(f, "utf8")) && !f.endsWith("brand.ts"));
  t("brand: gold is never used as a text colour in the app (decoration only)", gold.length === 0, gold.join(", "));
  const cfg = fs.readFileSync(path.join(process.cwd(), "tailwind.config.ts"), "utf8");
  t("brand: the styling config reads the shared palette (light and dark), not its own copy", cfg.includes("BRAND_DARK") && cfg.includes("THEME_TOKENS") && !/#[0-9a-fA-F]{6}/.test(cfg));

  // Icons are cached for a year and phones keep their own copy: every icon URL must carry a version
  // that changes with the colour, or an old-colour icon keeps showing.
  const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");
  t("icons: the version follows the accent colour", ICON_VERSION.startsWith(BRAND.accent.slice(1) + "-"), ICON_VERSION);
  t("icons: every size's URL is versioned", ICON_SIZES.every((n) => iconUrl(n) === `/pwa-icon/${n}?v=${ICON_VERSION}`));
  t("icons: the home-screen, tab and manifest icons all use the versioned URLs", /iconUrl\(64\)/.test(read("app/layout.tsx")) && /iconUrl\(180\)/.test(read("app/layout.tsx")) && /iconUrl\(192\)/.test(read("app/manifest.ts")) && /iconUrl\(512\)/.test(read("app/manifest.ts")));
  t("icons: the notification icon in the service worker uses the current version", read("public/sw.js").includes(iconUrl(192)), "sw.js is static: update its icon line when ICON_VERSION changes");
  t("icons: no unversioned icon URL is left anywhere", ["app", "components", "lib", "public"].flatMap((d) => walk(path.join(process.cwd(), d)).concat(fs.existsSync(path.join(process.cwd(), d, "sw.js")) ? [path.join(process.cwd(), d, "sw.js")] : [])).every((f) => !/["'`]\/pwa-icon\/\d+["'`]/.test(fs.readFileSync(f, "utf8"))));
  t("icons: the old separate icon routes (with year-long caches under fixed URLs) are gone", !fs.existsSync(path.join(process.cwd(), "app/icon.tsx")) && !fs.existsSync(path.join(process.cwd(), "app/apple-icon.tsx")));
}

// ---- deleting a meetup tells the people who joined, but only if the delete really happened ----
{
  const src = fs.readFileSync(path.join(process.cwd(), "app/actions.ts"), "utf8");
  const body = src.slice(src.indexOf("export async function deleteEvent"), src.indexOf("export async function signOut"));
  const iSnap = body.indexOf("snapshotBeforeDelete(");
  const iDelete = body.indexOf('.from("events")');
  const iFail = body.indexOf("data.length === 0");
  const iSend = body.indexOf("notifyEventDeleted(");
  t("delete: who was going is looked up BEFORE the delete (the guest list goes with the meetup)", iSnap > -1 && iSnap < iDelete, JSON.stringify({ iSnap, iDelete }));
  t("delete: nobody is notified unless the delete succeeded (the send comes after the failure check)", iFail > -1 && iSend > iFail, JSON.stringify({ iFail, iSend }));
  const manage = fs.readFileSync(path.join(process.cwd(), "components/ManageEvent.tsx"), "utf8");
  t("cancel: the helper text no longer claims people aren't emailed", !/aren.{1,8}t emailed/i.test(manage) && /email and a push/i.test(manage));
  const del = fs.readFileSync(path.join(process.cwd(), "components/DeleteEventButton.tsx"), "utf8");
  t("delete: the confirmation says the guests will be told, and how the button differs from Cancel", /will be told it was cancelled/.test(del) && /Cancel above instead/.test(del));
}

// ---- login: people are told where to look if the code email lands in spam ----
{
  const login = fs.readFileSync(path.join(process.cwd(), "components/LoginForm.tsx"), "utf8");
  const step = login.slice(login.indexOf('status === "sent"'), login.indexOf("return (\n    <form onSubmit={sendLink}"));
  t("login: the 'Check your email' screen says to look in spam/junk and tap 'Not spam'", /spam or junk folder/.test(step) && /Not spam/.test(step) && /after a minute/.test(step));
  t("login: that hint is on the code screen only (not the first form)", !/spam/.test(login.slice(login.indexOf("return (\n    <form onSubmit={sendLink}"))));
}

// ---- the feed: the same Filters button on the List and Swipe tabs ----
{
  const feed = fs.readFileSync(path.join(process.cwd(), "app/(feed)/page.tsx"), "utf8");
  t("feed: there is ONE Filters button + View toggle, defined once and used by both tabs", (feed.match(/<FiltersSheet\b/g) ?? []).length === 1 && (feed.match(/<ViewToggle\b/g) ?? []).length === 1 && (feed.match(/\{controls\}/g) ?? []).length === 3, `${(feed.match(/\{controls\}/g) ?? []).length} uses`);
  t("feed: the calendar, dropdowns and chips exist only inside the Filters panel (not spread across the list page)", (feed.match(/<FeedSelects\b/g) ?? []).length === 1 && (feed.match(/<FilterChips\b/g) ?? []).length === 1 && (feed.match(/\{strip\}/g) ?? []).length === 1 && /<FiltersSheet count=\{activeFilters\}>\s*\n\s*\{strip\}\s*\n\s*<FeedSelects[^\n]*\n\s*<FilterChips/.test(feed));
  t("feed: the count on the button covers every kind of filter, including the date", /const activeFilters = \[filters\.category, filters\.neighborhood, filters\.level, filters\.audience, filters\.eligible, dateFiltered\]/.test(feed));
  t("feed: the controls sit at the right end of the row on both tabs, even when the row wraps on a small phone", /className="ml-auto flex shrink-0 items-center gap-2"/.test(feed));
}

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
