// Light milestones and the getting-started steps. `npm run test:unit`.
import fs from "node:fs";
import path from "node:path";
import { computeMilestones, isNewlyReached, nextMilestone, onboardingSteps, untilText, type MilestoneInput } from "../lib/milestones.ts";

let passed = 0;
let failed = 0;
const t = (name: string, cond: boolean, extra = "") => {
  cond ? passed++ : failed++;
  console.log(`${cond ? "ok   " : "FAIL "}${name}${cond ? "" : "  -> " + extra}`);
};
const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

const w = (day: number, category = "Running", neighborhood = "Oakland") => ({ starts_at: `2026-08-${String(day).padStart(2, "0")}T18:00:00Z`, category, neighborhood });
const none: MilestoneInput = { attended: [], hosted: [], friendsBrought: 0 };
const get = (input: MilestoneInput, id: string) => computeMilestones(input).find((m) => m.id === id)!;
const NOW = new Date("2026-09-01T12:00:00Z");

// ───────── attending ─────────
{
  t("nothing has happened: nothing is achieved, and nothing is invented", computeMilestones(none).every((m) => !m.achieved && m.current === 0 && m.achievedAt === null));
  const one = { ...none, attended: [w(3)] };
  t("first meetup: reached at exactly one, dated to that meetup", get(one, "first-meetup").achieved && get(one, "first-meetup").achievedAt === w(3).starts_at && !get(one, "regular").achieved);
  t("progress toward the next: 1 of 3 for Regular", get(one, "regular").current === 1 && get(one, "regular").target === 3);
  const five = { ...none, attended: [w(9), w(1), w(5), w(3), w(7)] };
  t("the ladder: 3 makes Regular, 5 makes High five, on the date of the 3rd/5th meetup in time order (not list order)", get(five, "regular").achievedAt === w(5).starts_at && get(five, "high-five").achievedAt === w(9).starts_at && !get(five, "local").achieved);
  t("progress never goes past the goal", get({ ...none, attended: Array.from({ length: 12 }, (_, i) => w(i + 1)) }, "regular").current === 3 && get({ ...none, attended: Array.from({ length: 12 }, (_, i) => w(i + 1)) }, "local").achieved);
  const mixed = { ...none, attended: [w(1, "Running", "Oakland"), w(2, "Running", "Oakland"), w(3, "Yoga", "Berkeley"), w(4, "Dinner", "Berkeley"), w(5, "Music", "SF - Mission")] };
  t("explorer: three different kinds of meetup, dated to the meetup that made the third", get(mixed, "explorer").achieved && get(mixed, "explorer").achievedAt === w(4).starts_at && get(mixed, "explorer").current === 3);
  t("around town: three different neighborhoods, dated to the meetup that made the third", get(mixed, "around-town").achieved && get(mixed, "around-town").achievedAt === w(5).starts_at);
  t("going to the same kind of meetup again and again is not exploring", !get({ ...none, attended: [w(1), w(2), w(3), w(4)] }, "explorer").achieved && get({ ...none, attended: [w(1), w(2), w(3), w(4)] }, "explorer").current === 1);
  const before = JSON.stringify(five); computeMilestones(five);
  t("the input isn't changed", JSON.stringify(five) === before);
}

// ───────── hosting and friends ─────────
{
  const host = { ...none, hosted: [{ starts_at: "2026-08-02T18:00:00Z" }] };
  t("first host: reached with one hosted meetup, dated to it", get(host, "first-host").achieved && get(host, "first-host").achievedAt === "2026-08-02T18:00:00Z" && !get(host, "regular-host").achieved);
  t("regular host: five hosted", get({ ...none, hosted: Array.from({ length: 5 }, (_, i) => ({ starts_at: `2026-08-0${i + 1}T18:00:00Z` })) }, "regular-host").achieved);
  t("hosting doesn't count as attending, and attending doesn't count as hosting", !get(host, "first-meetup").achieved && !get({ ...none, attended: [w(1)] }, "first-host").achieved);
  t("connector: one friend who joined from your invite; social butterfly: three", get({ ...none, friendsBrought: 1 }, "connector").achieved && !get({ ...none, friendsBrought: 1 }, "butterfly").achieved && get({ ...none, friendsBrought: 3 }, "butterfly").achieved);
  t("friends: we can't say when, so it's never called 'new'", get({ ...none, friendsBrought: 2 }, "connector").achievedAt === null);
  t("friends: nonsense counts are treated as none (never negative or fractional)", get({ ...none, friendsBrought: -5 }, "connector").current === 0 && get({ ...none, friendsBrought: 2.9 }, "connector").current === 1);
}

// ───────── what to show ─────────
{
  const list = computeMilestones({ ...none, attended: [w(1), w(2)] });
  const next = nextMilestone(list)!;
  t("next goal: the unfinished one you're closest to (Regular: 2 of 3 beats Explorer: 1 of 3)", next.id === "regular", next?.id);
  t("next goal: none when everything is done", nextMilestone(computeMilestones({ attended: Array.from({ length: 12 }, (_, i) => w(i + 1, ["A", "B", "C", "D"][i % 4], ["X", "Y", "Z", "W"][i % 4])), hosted: Array.from({ length: 5 }, (_, i) => ({ starts_at: `2026-08-0${i + 1}T18:00:00Z` })), friendsBrought: 5 })) === null);
  t("next goal: with a fresh start, something is still offered", nextMilestone(computeMilestones(none)) !== null);
  t("wording: '1 more meetup to Regular' / '2 more meetups to Regular'", untilText(get({ ...none, attended: [w(1), w(2)] }, "regular")) === "1 meetup to Regular" && untilText(get({ ...none, attended: [w(1)] }, "regular")) === "2 meetups to Regular");
  t("wording: other goals read naturally", untilText(get({ ...none, attended: [w(1)] }, "explorer")) === "2 new kinds of meetup to Explorer" && untilText(get(none, "connector")) === "1 friend to invite to Connector" && untilText(get(none, "first-host")) === "1 meetup to host to Host");
  const fresh = get({ ...none, attended: [w(1)] }, "first-meetup");
  t("'New': only within the last week of being reached", isNewlyReached(fresh, new Date("2026-08-08T18:00:00Z")) && !isNewlyReached(fresh, new Date("2026-08-15T18:00:00Z")) && !isNewlyReached(fresh, new Date("2026-08-01T00:00:00Z")));
  t("'New': never for something not reached, or reached at an unknown time", !isNewlyReached(get(none, "first-meetup"), NOW) && !isNewlyReached(get({ ...none, friendsBrought: 1 }, "connector"), NOW));
}

// ───────── getting started ─────────
{
  const s = onboardingSteps({ hasInterests: true, hasAbout: false, hasJoined: false });
  t("getting started: three steps, in order, each with a place to do it", s.map((x) => x.id).join() === "interests,about,join" && s.every((x) => x.href.startsWith("/")));
  t("getting started: what's done shows as done", s[0].done && !s[1].done && !s[2].done);
  t("getting started: the interests and 'about you' steps go to the right places on Me", s[0].href === "/me#interests" && s[1].href === "/me#about" && s[2].href === "/");
  t("getting started: all done means all three are done", onboardingSteps({ hasInterests: true, hasAbout: true, hasJoined: true }).every((x) => x.done));
}

// ───────── the screens ─────────
{
  const me = read("app/me/page.tsx");
  t("Me: someone who hasn't been to (or hosted) a meetup sees the getting-started steps; everyone else sees their journey", /started \? <Journey milestones=\{milestones\} \/> : <GettingStarted steps=\{steps\} \/>/.test(me) && /const started = attended\.length > 0 \|\| pastHosted\.length > 0/.test(me));
  t("Me: 'attended' is only meetups that were approved, not yours, not cancelled and already over", /statusByEvent\[e\.id\] === "approved" && e\.host_id !== user\.id && !e\.cancelled_at && new Date\(e\.starts_at\)\.getTime\(\) < Date\.now\(\)/.test(me));
  t("Me: friends brought is best effort (an error, e.g. before the database update, means zero)", /if \(!broughtError\) friendsBrought/.test(me));
  t("Me: the interests section can be jumped to", /<section id="interests">/.test(me) && /<section id="about">/.test(me));
  const ui = read("components/Journey.tsx");
  t("screens: the progress bars are real progress bars for screen readers", (ui.match(/role="progressbar"/g) ?? []).length === 2 && /aria-valuenow/.test(ui));
  t("screens: the getting-started card disappears once everything is done", /if \(done === steps\.length\) return null/.test(ui));
  t("screens: nothing is stored: milestones have no database table or write", !/from\("milestones"\)|insert|update\(/.test(read("lib/milestones.ts")));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
