// The generated cover art: same meetup -> same picture, different details -> different picture,
// and nothing a person types can ever end up in the markup. Run with `npm run test:unit`.
import fs from "node:fs";
import path from "node:path";
import { CATEGORIES, NEIGHBORHOODS } from "../lib/constants.ts";
import { coverChangeNote, describeChanges, readBefore, type CoverChangeInput } from "../lib/cover-change.ts";
import { CATEGORY_COLOR, coverSpec, coverSvg, sceneFor, slotFor, type CoverInput, type Scene, type Slot } from "../lib/cover.ts";

let passed = 0;
let failed = 0;
const t = (name: string, cond: boolean, extra = "") => {
  cond ? passed++ : failed++;
  console.log(`${cond ? "ok   " : "FAIL "}${name}${cond ? "" : "  -> " + extra}`);
};

const base: CoverInput = { id: "11111111-1111-4111-8111-111111111111", category: "Running", neighborhood: "Oakland", startsAt: "2026-09-26T14:00:00Z", skill: "All levels", maxSpots: 8 };
const svg = (o: Partial<CoverInput> = {}) => coverSvg({ ...base, ...o });

// ───────── same in, same out; different in, different out ─────────
t("cover: the same meetup always gets the same picture", svg() === svg() && coverSvg({ ...base }) === coverSvg({ ...base }));
t("cover: a different meetup id gives a different picture (same everything else)", svg({ id: "22222222-2222-4222-8222-222222222222" }) !== svg());
{
  const ids = Array.from({ length: 200 }, (_, i) => `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`);
  t("cover: 200 similar meetups produce 200 different pictures", new Set(ids.map((id) => svg({ id }))).size === 200);
}
t("cover: time of day changes the picture", svg({ startsAt: "2026-09-26T03:00:00Z" }) !== svg());
t("cover: category changes the picture", svg({ category: "Yoga" }) !== svg());
t("cover: neighborhood changes the picture", svg({ neighborhood: "Berkeley" }) !== svg());
t("cover: skill level changes the picture", svg({ skill: "Advanced" }) !== svg({ skill: "Beginner" }));
t("cover: group size changes the picture", svg({ maxSpots: 3 }) !== svg({ maxSpots: 9 }));
t("cover: an advanced meetup has jagged peaks, a beginner one soft hills", /L\d/.test(svg({ skill: "Advanced", neighborhood: "Fremont" }).match(/d="M-25[^"]*"/)?.[0] ?? "") && /Q/.test(svg({ skill: "Beginner", neighborhood: "Fremont" }).match(/d="M-25[^"]*"/)?.[0] ?? ""));

// ───────── what each detail means ─────────
{
  const slots: Slot[] = Array.from({ length: 24 }, (_, h) => slotFor(h));
  t("time of day: every hour has a sky, and all six skies are used", new Set(slots).size === 6 && slots.every(Boolean));
  t("time of day: 7 AM is dawn, 9 AM morning, noon midday, 5 PM golden, 8 PM dusk, midnight night", [7, 9, 12, 17, 20, 0].map(slotFor).join() === "dawn,morning,midday,golden,dusk,night", [7, 9, 12, 17, 20, 0].map(slotFor).join());
  const at = (iso: string) => coverSpec({ ...base, startsAt: iso }).slot;
  t("time of day: read in Pacific time, in summer (PDT)", at("2026-09-26T14:00:00Z") === "dawn" && at("2026-09-27T03:30:00Z") === "dusk" && at("2026-09-27T05:30:00Z") === "night");
  t("time of day: ...and in winter (PST), so the clock change doesn't shift it", at("2026-01-15T15:00:00Z") === "dawn" && at("2026-01-16T04:30:00Z") === "dusk" && at("2026-01-16T06:30:00Z") === "night");
  t("time of day: a bad timestamp doesn't crash (falls back to midday)", coverSpec({ ...base, startsAt: "not a date" }).slot === "midday" && svg({ startsAt: "" }).startsWith("<svg"));
}
{
  const unmapped = NEIGHBORHOODS.filter((h) => sceneFor(h, 0) !== sceneFor(h, 1) || sceneFor(h, 0) !== sceneFor(h, 5));
  t(`scene: every one of the ${NEIGHBORHOODS.length} neighborhoods in the post form has its own scene`, unmapped.length === 0, unmapped.join(", "));
  const used = new Set<Scene>(NEIGHBORHOODS.map((h) => sceneFor(h, 0)));
  t("scene: all eight scenes are used somewhere", used.size === 8, [...used].join());
  t("scene: the famous places look right", sceneFor("SF - Presidio") === "bridge" && sceneFor("Berkeley") === "campanile" && sceneFor("SF - Mission") === "houses" && sceneFor("Napa") === "vineyard" && sceneFor("Half Moon Bay") === "coast" && sceneFor("San Jose") === "skyline");
  t("scene: an unknown neighborhood still gets a scene (varies by meetup)", ["bridge", "houses", "campanile", "skyline", "coast", "vineyard", "redwoods", "hills"].includes(sceneFor("Nowhere", 3)));
}
t("colour: every category has its own colour", CATEGORIES.every((c) => /^#[0-9a-f]{6}$/i.test(CATEGORY_COLOR[c] ?? "")) && new Set(CATEGORIES.map((c) => CATEGORY_COLOR[c])).size >= CATEGORIES.length - 2);
t("group size: 2 to 9 little people, whatever the number of spots", coverSpec({ ...base, maxSpots: 1 }).people === 2 && coverSpec({ ...base, maxSpots: 200 }).people === 9 && coverSpec({ ...base, maxSpots: undefined }).people === 6 && coverSpec({ ...base, maxSpots: 5 }).people === 5);

// ───────── the markup is safe, well formed and small ─────────
const ALLOWED_TAGS = new Set(["svg", "defs", "linearGradient", "stop", "rect", "circle", "ellipse", "path", "g"]);
const ALLOWED_ATTRS = new Set(["xmlns", "viewBox", "preserveAspectRatio", "aria-hidden", "focusable", "id", "x1", "y1", "x2", "y2", "offset", "stop-color", "width", "height", "fill", "x", "y", "rx", "ry", "cx", "cy", "r", "d", "opacity", "stroke", "stroke-width", "stroke-linecap", "transform"]);
function problems(markup: string) {
  const bad: string[] = [];
  for (const m of markup.matchAll(/<\/?([a-zA-Z]+)([^>]*)>/g)) {
    if (!ALLOWED_TAGS.has(m[1])) bad.push(`tag <${m[1]}>`);
    for (const a of m[2].matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)) {
      if (!ALLOWED_ATTRS.has(a[1])) bad.push(`attribute ${a[1]}`);
      if (!/^[#A-Za-z0-9 .,()\-:/_]*$/.test(a[2]) || /javascript|script|data:|http/i.test(a[2].replace("http://www.w3.org/2000/svg", ""))) bad.push(`value ${a[1]}="${a[2].slice(0, 30)}"`);
    }
  }
  if (/NaN|Infinity|undefined|null/.test(markup)) bad.push("a bad number");
  const opens = (markup.match(/<(svg|defs|linearGradient|g)\b/g) ?? []).length;
  const closes = (markup.match(/<\/(svg|defs|linearGradient|g)>/g) ?? []).length;
  if (opens !== closes) bad.push(`unbalanced tags ${opens}/${closes}`);
  return bad;
}
{
  const hostile = `"><script>alert(1)</script><img src=x onerror=alert(1)> ‮&amp;'`;
  const out = svg({ id: hostile, category: hostile, neighborhood: hostile, skill: hostile, startsAt: hostile });
  t("safety: hostile text in every field is never written into the picture", !out.includes("script") && !out.includes("onerror") && !out.includes("alert") && !out.includes("<img") && problems(out).length === 0, problems(out).join("; "));
  t("safety: the id in the gradient name is plain letters and digits", /id="c[0-9a-z]+"/.test(out) && /url\(#c[0-9a-z]+\)/.test(out));
}
{
  // every category x every scene x every sky
  const hoods: Record<Scene, string> = { bridge: "Sausalito", houses: "SF - Mission", campanile: "Berkeley", skyline: "Oakland", coast: "Pacifica", vineyard: "Napa", redwoods: "Mill Valley", hills: "Fremont" };
  const hours = [13, 16, 20, 23, 2, 5]; // UTC hours giving the six skies in Pacific time
  let count = 0, worst = 0;
  const bad: string[] = [];
  for (const category of [...CATEGORIES, "Made-up"]) for (const [scene, neighborhood] of Object.entries(hoods)) for (const h of hours) {
    const iso = `2026-09-26T${String(h).padStart(2, "0")}:15:00Z`;
    const s = coverSvg({ id: `${category}-${scene}-${h}`, category, neighborhood, startsAt: iso, skill: "Intermediate", maxSpots: 7 });
    count++; worst = Math.max(worst, s.length);
    const p = problems(s);
    if (p.length || !s.startsWith("<svg") || !s.endsWith("</svg>")) bad.push(`${category}/${scene}/${h}: ${p.join(",")}`);
  }
  t(`safety: ${count} combinations of category, scene and sky are all well formed, with only known tags, attributes and plain values`, bad.length === 0, bad.slice(0, 3).join(" | "));
  t(`size: the biggest picture is under 10 KB (${Math.round(worst / 100) / 10} KB)`, worst < 10000, String(worst));
}

// ───────── privacy: only public details go in ─────────
{
  const src = fs.readFileSync(path.join(process.cwd(), "lib/cover.ts"), "utf8").replace(/\/\/.*$/gm, "");
  t("privacy: the generator's input has no venue, address, title, description or host", !/venue|address|description|title|host/i.test(src.slice(src.indexOf("export type CoverInput"), src.indexOf("export type Slot"))));
  const used = ["components/EventCover.tsx", "components/EventCard.tsx", "components/SwipeDeck.tsx", "components/NextUp.tsx", "app/events/[id]/page.tsx", "lib/event-og.tsx"];
  const calls = used.flatMap((f) => (fs.readFileSync(path.join(process.cwd(), f), "utf8").match(/<EventCover[\s\S]*?>|coverSvg\(\{[\s\S]*?\}\)/g) ?? []));
  t("privacy: nowhere passes a venue, address or description into the picture", calls.length >= 5 && calls.every((c) => !/venue|address|description|blurb|title/i.test(c)), calls.filter((c) => /venue|address|description|blurb|title/i.test(c)).join(" | "));
}

// ───────── telling people who joined when the picture's details change ─────────
{
  const NOW_STATE = { cancelled: false, ended: false };
  // The meetup as it is now: 8 spots, changed from 10 on Sep 22.
  const before = { starts_at: "2026-09-26T14:00:00Z", neighborhood: "Oakland", category: "Running", skill_level: "All levels", max_spots: 10 };
  const now: CoverChangeInput = { id: base.id, starts_at: "2026-09-26T14:00:00Z", neighborhood: "Oakland", category: "Running", skill_level: "All levels", max_spots: 8, details_changed_at: "2026-09-22T18:00:00Z", details_before: before };
  const joinedEarlier = { isHost: false, joinedAt: "2026-09-21T10:00:00Z" };
  const joinedLater = { isHost: false, joinedAt: "2026-09-23T10:00:00Z" };
  const stranger = { isHost: false, joinedAt: null };
  const host = { isHost: true, joinedAt: null };

  const note = coverChangeNote(now, joinedEarlier, NOW_STATE);
  t("note: someone who joined before a change is told (spots 10 -> 8 redraws the group)", note !== null && note.redrawn && note.changes.length === 1 && note.changes[0].what === "Spots" && note.changes[0].from === "10" && note.changes[0].to === "8", JSON.stringify(note));
  t("note: it carries the date of the change (Pacific)", note?.date === "Sep 22", note?.date);
  t("note: the host is told too, even without a join date", coverChangeNote(now, host, NOW_STATE) !== null);
  t("note: someone who joined AFTER the change isn't (they've only ever seen the current picture)", coverChangeNote(now, joinedLater, NOW_STATE) === null);
  t("note: someone who hasn't joined isn't", coverChangeNote(now, stranger, NOW_STATE) === null);
  t("note: nothing once the meetup is cancelled or over", coverChangeNote(now, joinedEarlier, { cancelled: true, ended: false }) === null && coverChangeNote(now, joinedEarlier, { cancelled: false, ended: true }) === null);
  t("note: nothing when no change was ever recorded", coverChangeNote({ ...now, details_changed_at: null, details_before: null }, host, NOW_STATE) === null && coverChangeNote({ ...now, details_changed_at: undefined, details_before: undefined }, host, NOW_STATE) === null);

  // spots that change nothing anyone can see stay quiet
  const quiet = { ...now, details_before: { ...before, max_spots: 12 }, max_spots: 10 };
  t("note: spots 12 -> 10 (picture identical, nothing else changed) stays quiet", coverChangeNote(quiet, joinedEarlier, NOW_STATE) === null);

  // time, place, category and skill always matter, even when the sky doesn't change
  const later = { ...now, max_spots: 10, starts_at: "2026-09-26T15:00:00Z" }; // 7 AM -> 8 AM: dawn -> morning
  const sameSky = { ...now, max_spots: 10, details_before: { ...before, starts_at: "2026-09-26T13:30:00Z" }, starts_at: "2026-09-26T14:30:00Z" }; // 6:30 -> 7:30 AM, both dawn
  const n1 = coverChangeNote(later, joinedEarlier, NOW_STATE);
  t("note: a later start time is flagged, with the old and new time", n1 !== null && n1.changes[0].what === "Time" && n1.changes[0].from === "Sat, Sep 26 · 7:00 AM" && n1.changes[0].to === "Sat, Sep 26 · 8:00 AM", JSON.stringify(n1));
  t("note: a time change that keeps the same sky is still flagged, but says nothing about a redraw", (() => { const n = coverChangeNote(sameSky, joinedEarlier, NOW_STATE); return n !== null && n.redrawn === false && n.changes[0].what === "Time"; })());
  t("note: a new neighborhood is flagged (and redraws the scene)", (() => { const n = coverChangeNote({ ...now, max_spots: 10, neighborhood: "Berkeley" }, joinedEarlier, NOW_STATE); return n !== null && n.redrawn && n.changes[0].what === "Neighborhood" && n.changes[0].to === "Berkeley"; })());
  t("note: a new category is flagged", coverChangeNote({ ...now, max_spots: 10, category: "Yoga" }, joinedEarlier, NOW_STATE)?.changes[0].what === "Category");
  t("note: a new skill level is flagged", coverChangeNote({ ...now, max_spots: 10, skill_level: "Advanced" }, joinedEarlier, NOW_STATE)?.changes[0].what === "Skill level");
  const many = coverChangeNote({ ...now, neighborhood: "Berkeley", starts_at: "2026-09-27T02:00:00Z" }, joinedEarlier, NOW_STATE);
  t("note: several changes at once are all listed", many !== null && many.changes.map((c) => c.what).join() === "Time,Neighborhood,Spots", JSON.stringify(many?.changes));
  t("note: the same instant written two ways isn't a time change", coverChangeNote({ ...now, max_spots: 10, starts_at: "2026-09-26T14:00:00+00:00", details_before: { ...before, starts_at: "2026-09-26T07:00:00-07:00" } }, joinedEarlier, NOW_STATE) === null);
  t("note: it is exactly the moment of the change that counts (joined a second before is told, at the same second is not)", coverChangeNote(now, { isHost: false, joinedAt: "2026-09-22T17:59:59Z" }, NOW_STATE) !== null && coverChangeNote(now, { isHost: false, joinedAt: "2026-09-22T18:00:00Z" }, NOW_STATE) === null);

  // bad data from the database never crashes the page
  const junk: unknown[] = [null, undefined, "text", 5, [], {}, { starts_at: 1 }, { starts_at: "nope", neighborhood: "x", category: "y", skill_level: "z", max_spots: 1 }, { starts_at: "2026-09-26T14:00:00Z", neighborhood: "x", category: "y", skill_level: "z", max_spots: "3" }];
  t("note: unusable 'before' data means no note, and no crash", junk.every((j) => readBefore(j) === null && coverChangeNote({ ...now, details_before: j }, host, NOW_STATE) === null));
  t("note: an unreadable change time means no note", coverChangeNote({ ...now, details_changed_at: "garbage" }, host, NOW_STATE) === null);
  t("describe: nothing changed means nothing to list", describeChanges(before, { ...before }).length === 0);

  // the words shown to people never include anything they didn't already see
  const text = fs.readFileSync(path.join(process.cwd(), "components/CoverChangeNote.tsx"), "utf8");
  t("note: the text names what changed and says the picture was redrawn", /Details changed/.test(text) && /redrawn to match/.test(text) && /role="note"/.test(text));
  const page = fs.readFileSync(path.join(process.cwd(), "app/events/[id]/page.tsx"), "utf8");
  t("page: the note sits right under the picture, and is worked out from the viewer's own join time", /<\/EventCover>\s*\n\s*\n\s*\{coverNote && <CoverChangeNote note=\{coverNote\} \/>\}/.test(page) && /joinedAt: event\.rsvps\.find\(\(r\) => r\.user_id === user\?\.id\)\?\.created_at/.test(page));
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/schema.sql"), "utf8");
  t("database: the details_* columns are not in any grant the API roles get", !/grant[^;]*details_(changed_at|before)/i.test(sql));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
