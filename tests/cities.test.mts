// Cities, "Other" activities and the place-neutral wording. `npm run test:unit`.
// Everything that must stay exactly as it was with one city, and everything a second city relies on.
import fs from "node:fs";
import path from "node:path";
import { CITIES, DEFAULT_CITY_ID, cityById, cityOrDefault, inCity, isCityId, isMultiCity, neighborhoodsOf, type City } from "../lib/cities.ts";
import {
  ACTIVITY_MAX,
  CATEGORIES,
  CATEGORY_EMOJI,
  CATEGORY_GROUPS,
  CATEGORY_STYLES,
  NAMED_OTHER_CATEGORIES,
  NEIGHBORHOODS,
  NEIGHBORHOOD_GROUPS,
  categoryLabel,
  emojiFor,
  isCategory,
  isNamedOther,
  isNeighborhood,
} from "../lib/constants.ts";
import { CATEGORY_COLOR } from "../lib/cover.ts";
import { FEED_INTRO, TAGLINE } from "../lib/site.ts";
import { cityOfEvent, cityOfUser, loadPool } from "../lib/picks.ts";
import { sendDailyEmails } from "../lib/notify.ts";
import { validateEvent, validateEventDetails, validateEventEdit } from "../lib/validation.ts";
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

// A pretend second city, to prove the code that only matters once there are two.
const NEWVILLE: City = { id: "newville", name: "Newville", timezone: "America/Los_Angeles", groups: [{ label: "Downtown", items: ["Old Town", "Harbor"] }, { label: "Elsewhere", items: ["Other"] }] };
const TWO: readonly City[] = [...CITIES, NEWVILLE];
const withSecondCity = async <T,>(fn: () => Promise<T>): Promise<T> => {
  (CITIES as City[]).push(NEWVILLE);
  try { return await fn(); } finally { (CITIES as City[]).pop(); }
};

// ───────── the data: nothing about today's Bay Area changed ─────────
{
  t("cities: today there is exactly one, so no city control is shown anywhere", CITIES.length === 1 && !isMultiCity());
  t("cities: its id is the one the database gives every existing meetup", DEFAULT_CITY_ID === "sf-bay-area" && /default 'sf-bay-area'/.test(read("supabase/migrations/020_cities_and_activities.sql")) && /default 'sf-bay-area'/.test(read("supabase/schema.sql")));
  const counts = NEIGHBORHOOD_GROUPS.map((g) => `${g.label}:${g.items.length}`).join();
  t("places: the Bay Area lists are exactly what they were (same groups, same 109 places)", counts === "San Francisco:7,East Bay:33,Peninsula:20,South Bay:15,North Bay:33,Elsewhere:1" && NEIGHBORHOODS.length === 109, `${counts} / ${NEIGHBORHOODS.length}`);
  t("places: the values already stored on meetups are all still valid", ["SF - Mission", "SF - Marina", "SF - Presidio", "Oakland", "Berkeley", "Marin", "Napa", "San Jose", "Half Moon Bay", "Other"].every(isNeighborhood));
  t("places: no place is listed twice", new Set(NEIGHBORHOODS).size === NEIGHBORHOODS.length);
  t("cities: every id and place fits the database limits (1 to 40 characters)", CITIES.every((c) => c.id.length >= 1 && c.id.length <= 40 && c.groups.every((g) => g.items.every((n) => n.length >= 1 && n.length <= 40))));
  t("cities: ids are unique and every city has places", new Set(CITIES.map((c) => c.id)).size === CITIES.length && CITIES.every((c) => neighborhoodsOf(c.id).length > 0));
  // The time zone is a guard, not a feature: reminders, the 9am job, quiet hours and repeating dates all
  // read Pacific time (lib/time.ts). A city in another zone needs those made per-city first.
  t("time zones: every city is Pacific until times are made per-city (see lib/cities.ts)", CITIES.every((c) => c.timezone === "America/Los_Angeles"), CITIES.map((c) => c.timezone).join());
}

// ───────── the helpers ─────────
{
  t("helpers: ids are looked up exactly", cityById("sf-bay-area")?.name === "San Francisco Bay Area" && cityById("nope") === undefined && cityById(undefined) === undefined && cityById(42) === undefined);
  t("helpers: an unknown or missing city falls back to the first", cityOrDefault("nope").id === DEFAULT_CITY_ID && cityOrDefault(undefined).id === DEFAULT_CITY_ID && cityOrDefault(null).id === DEFAULT_CITY_ID);
  t("helpers: with two cities, both are known and a place belongs to its own city only", isCityId("newville", TWO) && !isCityId("newville") && inCity("Old Town", "newville", TWO) && !inCity("Old Town", "sf-bay-area", TWO) && inCity("Oakland", "sf-bay-area", TWO) && !inCity("Oakland", "newville", TWO));
  t("helpers: 'Other' is a place in each city that lists it", inCity("Other", "newville", TWO) && inCity("Other", "sf-bay-area", TWO));
  t("helpers: non-strings are never a place", !inCity(undefined, "newville", TWO) && !inCity(5, "newville", TWO));
  t("helpers: two cities means several", isMultiCity(TWO) && !isMultiCity(CITIES));
}

// ───────── posting and editing: the rules ─────────
const form = (o: Record<string, string> = {}): Record<string, string> => ({ title: "Run", category: "Running", description: "", max_spots: "6", skill_level: "All levels", audience: "Everyone", join_mode: "open", neighborhood: "Oakland", venue_name: "Park", address: "1 Main St", starts_at: "2099-01-01T10:00", age_min: "", age_max: "", chat_url: "", repeat_every: "", repeat_count: "", ...o });
{
  t("posting: a normal meetup, with no city or activity in the form, is exactly as valid as before", Object.keys(validateEvent(form())).length === 0);
  t("posting: naming the city explicitly is fine", Object.keys(validateEvent(form({ city: "sf-bay-area" }))).length === 0);
  t("posting: a made-up city is refused", validateEvent(form({ city: "atlantis" })).city === "Pick a city.");
  t("posting: a neighborhood from another city is refused (two cities)", validateEvent(form({ city: "newville", neighborhood: "Oakland" }), TWO).neighborhood === "Pick a neighborhood." && Object.keys(validateEvent(form({ city: "newville", neighborhood: "Old Town" }), TWO)).length === 0);
  t("posting: with no city given, the first city's places apply (a form from before cities)", validateEvent(form({ neighborhood: "Old Town" }), TWO).neighborhood === "Pick a neighborhood.");
  t("posting: a made-up neighborhood is still refused", validateEvent(form({ neighborhood: "Atlantis" })).neighborhood === "Pick a neighborhood.");
  const other = (o: Record<string, string>) => validateEvent(form({ category: "Other sports & fitness", ...o }));
  t("other: 'Other sports & fitness' needs a name", other({}).activity === "What is it? For example: Frisbee golf." && other({ activity: "   " }).activity !== undefined);
  t("other: a name makes it valid", Object.keys(other({ activity: "Frisbee golf" })).length === 0);
  t("other: 'Other social & interests' works the same way", validateEvent(form({ category: "Other social & interests" })).activity !== undefined && Object.keys(validateEvent(form({ category: "Other social & interests", activity: "Trivia night" }))).length === 0);
  t("other: the name is limited to 40 characters (the database limit)", Object.keys(other({ activity: "x".repeat(ACTIVITY_MAX) })).length === 0 && other({ activity: "x".repeat(ACTIVITY_MAX + 1) }).activity === "Keep it under 40 characters.");
  t("other: the plain 'Other' and every ordinary category need no name (and ignore one)", Object.keys(validateEvent(form({ category: "Other" }))).length === 0 && Object.keys(validateEvent(form({ activity: "leftover text" }))).length === 0 && CATEGORIES.filter((c) => !isNamedOther(c)).every((c) => validateEvent(form({ category: c })).activity === undefined));
  t("edit: the old edit rules are unchanged (no city needed)", Object.keys(validateEventEdit({ starts_at: "2099-01-01T10:00", neighborhood: "Berkeley", venue_name: "v", address: "a", max_spots: "5" })).length === 0);
  t("edit: with two cities the meetup's own city's places apply", validateEventDetails({ starts_at: "2099-01-01T10:00", neighborhood: "Harbor", venue_name: "v", address: "a", city: "newville" }, TWO).neighborhood === undefined && validateEventDetails({ starts_at: "2099-01-01T10:00", neighborhood: "Oakland", venue_name: "v", address: "a", city: "newville" }, TWO).neighborhood === "Pick a neighborhood.");
}

// ───────── the two new categories ─────────
{
  const sports = CATEGORY_GROUPS.find((g) => g.label === "Sports & fitness")!.items as readonly string[];
  const social = CATEGORY_GROUPS.find((g) => g.label === "Social & interests")!.items as readonly string[];
  t("categories: 'Other sports & fitness' ends the sports group and 'Other social & interests' ends the social group", sports.at(-1) === "Other sports & fitness" && social.at(-1) === "Other social & interests");
  t("categories: every category that existed is still there (plus exactly these two)", ["Basketball", "Dance", "Board Games", "Coffee Chat", "Volunteering", "Other"].every(isCategory) && CATEGORIES.length === 28 && NAMED_OTHER_CATEGORIES.every(isCategory));
  t("categories: the old plain 'Other' is still a choice for the ones already posted", isCategory("Other") && !isNamedOther("Other"));
  t("categories: both have a badge colour (light and dark), an emoji and a cover colour", NAMED_OTHER_CATEGORIES.every((c) => /dark:bg-/.test(CATEGORY_STYLES[c]) && /dark:text-/.test(CATEGORY_STYLES[c]) && CATEGORY_EMOJI[c] && emojiFor(c) === CATEGORY_EMOJI[c] && /^#[0-9a-f]{6}$/i.test(CATEGORY_COLOR[c] ?? "")));
  t("label: an 'Other ...' meetup shows the host's own name", categoryLabel("Other sports & fitness", "Frisbee golf") === "Frisbee golf" && categoryLabel("Other social & interests", "  Trivia night ") === "Trivia night");
  t("label: with no name (or blank) it shows the category", categoryLabel("Other sports & fitness", null) === "Other sports & fitness" && categoryLabel("Other sports & fitness", "  ") === "Other sports & fitness" && categoryLabel("Other social & interests") === "Other social & interests");
  t("label: an ordinary category is never renamed, even if a name is stored", categoryLabel("Running", "Frisbee golf") === "Running" && categoryLabel("Other", "Frisbee golf") === "Other");
}

// ───────── the wording: no longer only the Bay Area ─────────
{
  t("wording: the feed intro says 'in your city'", FEED_INTRO === "Pickup games, dinners and coffee chats in your city. Find one you like and join in a tap.");
  t("wording: the tagline is place-neutral", TAGLINE === "Find people to play, run, climb and hang out with in your city.");
  const shown = ["app/layout.tsx", "app/opengraph-image.tsx", "lib/site.ts", "lib/email-templates.ts", "lib/milestones.ts", "components/Hero.tsx", "app/(feed)/page.tsx"].map(read).join("\n");
  t("wording: nothing a person reads (titles, share preview, emails, milestones, feed) says 'Bay Area' or 'the Bay'", !/Bay Area|around the Bay|the Bay\b/.test(shown), (shown.match(/.{20}(Bay Area|the Bay\b).{10}/) ?? [""])[0]);
  t("wording: the milestone is 'Around town'", /"Around town"/.test(read("lib/milestones.ts")) && !/Around the Bay/.test(read("lib/milestones.ts")));
}

// ───────── behaviour with one city: nothing extra is asked of the database ─────────
const counted = (data: FakeData) => {
  const inner = fakeAdmin(data, {});
  const tables: string[] = [];
  return { tables, client: { ...inner, from: (table: string) => (tables.push(table), inner.from(table)) } as unknown as ReturnType<typeof fakeAdmin> };
};
const ev = (id: string, o: Record<string, unknown> = {}) => ({ id, title: id, category: "Running", neighborhood: "Oakland", starts_at: "2026-09-26T16:00:00Z", host_id: "host", join_mode: "open", venue_name: "Park", address: "1 Main", cancelled_at: null, max_spots: 8, spots_taken: 2, audience: "Everyone", age_min: null, age_max: null, series_id: null, ...o });
const NOW = new Date("2026-09-24T16:00:00Z");
{
  // rows with no city column at all: a database from before migration 020
  const old = counted({ events: [ev("a"), ev("b")], user_settings: [{ user_id: "ann" }] });
  t("one city: the picks pool needs no city column (a database from before 020 works)", (await loadPool(old.client, NOW, 14, 300, "sf-bay-area")).length === 2 && (await loadPool(old.client, NOW, 14)).length === 2);
  const q = counted({ events: [ev("a")], user_settings: [] });
  t("one city: finding someone's or a meetup's city asks the database nothing and gives the first city", (await cityOfUser(q.client, "ann")) === DEFAULT_CITY_ID && (await cityOfEvent(q.client, "a")) === DEFAULT_CITY_ID && q.tables.length === 0, q.tables.join());
}

// ───────── behaviour with two cities ─────────
await withSecondCity(async () => {
  const data = (): FakeData => ({
    events: [ev("oak-run", { city: "sf-bay-area" }), ev("oak-yoga", { city: "sf-bay-area", category: "Yoga" }), ev("town-run", { city: "newville", neighborhood: "Old Town" }), ev("town-yoga", { city: "newville", neighborhood: "Harbor", category: "Yoga" })],
    user_settings: [{ user_id: "ann", city: "newville" }, { user_id: "bob" }],
  });
  const admin = fakeAdmin(data(), {});
  t("two cities: the pool is that city's meetups only", (await loadPool(admin, NOW, 14, 300, "newville")).map((c) => c.id).sort().join() === "town-run,town-yoga" && (await loadPool(admin, NOW, 14, 300, "sf-bay-area")).map((c) => c.id).sort().join() === "oak-run,oak-yoga");
  t("two cities: an unknown city id falls back to the first city's meetups", (await loadPool(admin, NOW, 14, 300, "atlantis")).map((c) => c.id).sort().join() === "oak-run,oak-yoga");
  t("two cities: someone's city is what they saved; with nothing saved, the first city", (await cityOfUser(admin, "ann")) === "newville" && (await cityOfUser(admin, "bob")) === DEFAULT_CITY_ID && (await cityOfUser(admin, "nobody")) === DEFAULT_CITY_ID);
  t("two cities: a meetup's city is the one stored on it", (await cityOfEvent(admin, "town-run")) === "newville" && (await cityOfEvent(admin, "oak-run")) === "sf-bay-area" && (await cityOfEvent(admin, "missing")) === DEFAULT_CITY_ID);

  // the weekly digest comes from the reader's own city
  const d = data();
  d.rsvps = [];
  d.profiles = [{ id: "host", name: "Host" }, { id: "ann", name: "Ann Lee" }, { id: "bob", name: "Bob Ray" }];
  d.user_interests = [{ user_id: "ann", categories: ["Running"] }, { user_id: "bob", categories: ["Running"] }];
  d.profile_private = [];
  d.notification_log = [];
  const users = { host: { email: "host@example.com" }, ann: { email: "ann@example.com" }, bob: { email: "bob@example.com" } };
  const box = fakeMailbox();
  const res = await silently(() => sendDailyEmails(new Date("2026-09-24T16:00:00Z"), { admin: fakeAdmin(d, users), send: box.send, push: async () => ({ sent: 0, removed: 0, failed: 0 }) }));
  const annMail = box.sent.find((m) => m.to === "ann@example.com")?.text ?? "";
  const bobMail = box.sent.find((m) => m.to === "bob@example.com")?.text ?? "";
  t("two cities: each person's weekly digest lists their own city's meetups only", res.digests === 2 && /town-run/.test(annMail) && !/oak-run/.test(annMail) && /oak-run/.test(bobMail) && !/town-run/.test(bobMail), JSON.stringify({ d: res.digests, annMail, bobMail }));
});

// ───────── the doors: where the app reads and writes a city ─────────
{
  const actions = read("app/actions.ts");
  const create = actions.slice(actions.indexOf("export async function createEvent"), actions.indexOf("export async function cancelSeries"));
  t("posting: a one-off meetup sends a city only when there are several cities, and a name only for 'Other ...' (undefined is never sent)", /city: isMultiCity\(\) \? cityId : undefined/.test(create) && /activity: withActivity && activity \? activity : undefined/.test(create));
  t("posting: without migration 020, a one-city app still posts (the name is dropped), several cities can't", /PGRST204/.test(create) && /await one\(false\)/.test(create) && /if \(isMultiCity\(\)\) return/.test(create) && /020_cities_and_activities/.test(create));
  t("posting: a series still posts when only 019 has been run (one city)", /await series\(false\)/.test(create) && /!isMultiCity\(\)/.test(create));
  t("posting: the city sent is always one that exists", /isCityId\(input\.city\) \? input\.city : DEFAULT_CITY_ID/.test(create));
  t("posting: the 'Other ...' name is only used for those two categories", /isNamedOther\(input\.category\) \? input\.activity : ""/.test(create));
  const edit = actions.slice(actions.indexOf("export async function updateEventDetails"), actions.indexOf("export async function updateEventDetails") + 4200);
  t("editing: with several cities, the new neighborhood must be in the meetup's own city; a one-city app asks nothing extra", /if \(isMultiCity\(\)\)[\s\S]{0,400}inCity\(input\.neighborhood/.test(edit));
  const set = actions.slice(actions.indexOf("export async function setCity"), actions.indexOf("export async function setCity") + 1400);
  t("choosing a city: does nothing with one city, refuses unknown ones, remembers on the device and (best effort) on the account", /if \(!isMultiCity\(\)\) return \{\}/.test(set) && /isCityId\(cityId\)/.test(set) && /cookies\(\)\.set\(CITY_COOKIE/.test(set) && /updateOrInsert\(supabase, "user_settings"/.test(set));
  const feed = read("app/(feed)/page.tsx");
  t("feed: filters by city only with several cities (both the list and the week strip)", (feed.match(/if \(multiCity\) (query|cq) = \1\.eq\("city", city\)/g) ?? []).length === 2);
  t("feed: the city picker and the city's own places only appear with several cities", /const cityBar = multiCity \?/.test(feed) && /neighborhoods=\{cityOrDefault\(city\)\.groups\}/.test(feed));
  t("feed: a neighborhood filter from another city is ignored", /multiCity && filters\.neighborhood && !inCity\(filters\.neighborhood, city\)/.test(feed));
  t("new-meetup page: preselects the city they browse and copies the city and name when posting again", /defaultCity=\{await currentCity/.test(read("app/events/new/page.tsx")) && /select\("city, activity"\)/.test(read("app/events/new/page.tsx")));
  t("Me: 'Your city' only appears with several cities", /isMultiCity\(\) && \([\s\S]{0,200}Your city/.test(read("app/me/page.tsx")));
  const form = read("components/EventForm.tsx");
  t("form: the city choice and each city's places show only with several cities; 'What is it?' only for the two Other categories", /\{multi && \(/.test(form) && /isNamedOther\(category\)/.test(form) && /key=\{city\}/.test(form));
  const pre020 = ["app/events/[id]/opengraph-image.tsx", "lib/picks.ts", "app/events/new/page.tsx"].map(read).join("\n");
  t("older databases: no always-run query names the new columns (they are read separately, best effort, or only with several cities)", !/select\("[^"]*\b(activity|city)\b[^"]*"\)[\s\S]{0,60}\.in\(/.test(pre020) && /from\("events"\)\.select\("activity"\)/.test(read("app/events/[id]/opengraph-image.tsx")));
  const sql = read("supabase/migrations/020_cities_and_activities.sql");
  t("database: a meetup's city can be set when posting but never changed; the activity can be renamed by its host; the city setting is the person's own", /grant insert \(city, activity\) on public\.events/.test(sql) && /grant update \(activity\)\s+on public\.events/.test(sql) && !/grant update \([^)]*city[^)]*\) on public\.events/.test(sql) && /grant insert \(city\), update \(city\) on public\.user_settings/.test(sql));
  t("database: existing meetups get the default city, and running it twice is safe (every statement is guarded)", /add column if not exists city\s+text not null default 'sf-bay-area'/.test(sql) && !/^\s*create (table|index) (?!if not exists)/m.test(sql));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
