// Recurring meetups: the dates, the feed, the nudges and the doors. `npm run test:unit`.
import fs from "node:fs";
import path from "node:path";
import { collapseSeries, isRepeatEvery, occurrenceStarts, repeatLabel, repeatProblems, seriesNeedingMoreDates, suggestNextStart } from "../lib/recurrence.ts";
import { pacificLocalValue } from "../lib/time.ts";
import { validateEvent } from "../lib/validation.ts";

let passed = 0;
let failed = 0;
const t = (name: string, cond: boolean, extra = "") => {
  cond ? passed++ : failed++;
  console.log(`${cond ? "ok   " : "FAIL "}${name}${cond ? "" : "  -> " + extra}`);
};
const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");
const local = (iso: string) => pacificLocalValue(iso);

// ───────── the dates ─────────
{
  const w = occurrenceStarts("2026-09-24T18:30", 7, 4)!;
  t("dates: every week for 4 weeks", w.length === 4 && w.map(local).join() === "2026-09-24T18:30,2026-10-01T18:30,2026-10-08T18:30,2026-10-15T18:30", w.map(local).join());
  t("dates: every 2 weeks", occurrenceStarts("2026-09-24T18:30", 14, 3)!.map(local).join() === "2026-09-24T18:30,2026-10-08T18:30,2026-10-22T18:30");
  t("dates: the first date is exactly the one picked", occurrenceStarts("2026-09-24T18:30", 7, 2)![0] === new Date("2026-09-25T01:30:00Z").toISOString());
  const fall = occurrenceStarts("2026-10-22T18:30", 7, 4)!; // crosses the November 1 clock change
  t("dates: a 6:30 PM meetup stays at 6:30 PM when the clocks go back in November", fall.map(local).every((v) => v.endsWith("T18:30")), fall.map(local).join());
  t("dates: ...even though the UTC time shifts by an hour", new Date(fall[1]).getUTCHours() === 1 && new Date(fall[3]).getUTCHours() === 2, fall.join());
  const spring = occurrenceStarts("2027-02-25T18:30", 7, 4)!; // crosses the March 14 2027 clock change
  t("dates: ...and when they go forward in March", spring.map(local).every((v) => v.endsWith("T18:30")), spring.map(local).join());
  t("dates: dates stay a week apart on the calendar", occurrenceStarts("2026-12-29T09:00", 7, 3)!.map(local).join() === "2026-12-29T09:00,2027-01-05T09:00,2027-01-12T09:00");
  t("dates: they cross a month and year end correctly", occurrenceStarts("2026-12-31T20:00", 7, 2)!.map(local).join() === "2026-12-31T20:00,2027-01-07T20:00");
  const gap = occurrenceStarts("2027-03-07T02:30", 7, 2)!; // 2:30 AM doesn't exist on March 14 2027
  t("dates: a time that doesn't exist on a clock-change day moves to the next hour instead of failing", gap.length === 2 && local(gap[1]) === "2027-03-14T03:30", gap.map(local).join());
  t("dates: bad input gives null, never a crash or nonsense", ["", "tomorrow", "2026-13-40T99:99", "2026-09-24"].every((v) => occurrenceStarts(v, 7, 3) === null) && occurrenceStarts("2026-09-24T18:30", 5, 3) === null && occurrenceStarts("2026-09-24T18:30", 7, 0) === null && occurrenceStarts("2026-09-24T18:30", 7, 27) === null && occurrenceStarts("2026-09-24T18:30", 7, 2.5) === null);
  t("dates: every date is unique and in order", (() => { const d = occurrenceStarts("2026-09-24T18:30", 7, 12)!; return new Set(d).size === 12 && d.every((x, i) => i === 0 || new Date(x) > new Date(d[i - 1])); })());
}

// ───────── the settings ─────────
{
  t("repeat: only weekly and every-two-weeks are choices", isRepeatEvery(7) && isRepeatEvery(14) && !isRepeatEvery(1) && !isRepeatEvery(30) && !isRepeatEvery("7") && !isRepeatEvery(null));
  t("repeat: labels", repeatLabel(7) === "Weekly" && repeatLabel(14) === "Every 2 weeks" && repeatLabel(null) === null && repeatLabel(undefined) === null && repeatLabel(3) === null);
  t("repeat: no repeat means no problems (and the count is ignored)", Object.keys(repeatProblems("", "")).length === 0 && Object.keys(repeatProblems("", "99")).length === 0);
  t("repeat: a good weekly setup has no problems", Object.keys(repeatProblems("7", "8")).length === 0 && Object.keys(repeatProblems("14", "2")).length === 0 && Object.keys(repeatProblems("7", "12")).length === 0);
  t("repeat: a made-up interval is refused", !!repeatProblems("5", "4").repeat_every);
  t("repeat: the count must be a whole number from 2 to 12", ["", "1", "13", "abc", "2.5", "-3", "0"].every((c) => !!repeatProblems("7", c).repeat_count));
  const post = (o: Record<string, string>) => validateEvent({ title: "t", category: "Yoga", description: "", max_spots: "5", skill_level: "All levels", audience: "Everyone", join_mode: "open", age_min: "", age_max: "", chat_url: "", neighborhood: "Oakland", venue_name: "v", address: "a", starts_at: local(new Date(Date.now() + 3 * 86400000).toISOString()), ...o });
  t("posting: a normal meetup is unaffected by the new fields", Object.keys(post({})).length === 0, JSON.stringify(post({})));
  t("posting: a weekly meetup with a count is accepted", Object.keys(post({ repeat_every: "7", repeat_count: "6" })).length === 0);
  t("posting: a repeat without a count is refused with a message on the count", post({ repeat_every: "7", repeat_count: "" }).repeat_count === "How many meetups in total?");
  t("posting: a bad repeat is refused", !!post({ repeat_every: "3", repeat_count: "4" }).repeat_every);
}

// ───────── the feed ─────────
{
  const e = (id: string, series: string | null, at = "2026-10-01T00:00:00Z") => ({ id, series_id: series, starts_at: at });
  const list = [e("a", "S1"), e("solo1", null), e("b", "S1"), e("c", "S2"), e("d", "S1"), e("solo2", null), e("f", "S2")];
  t("feed: only the next date of each series is shown, everything else stays, in the same order", collapseSeries(list).map((x) => x.id).join() === "a,solo1,c,solo2");
  t("feed: it can show two dates per series if asked", collapseSeries(list, 2).map((x) => x.id).join() === "a,solo1,b,c,solo2,f");
  t("feed: meetups that aren't in a series are never dropped, however many there are", collapseSeries([e("x", null), e("y", null), e("z", undefined as never)]).length === 3);
  t("feed: nothing in, nothing out", collapseSeries([]).length === 0);
  const before = JSON.stringify(list); collapseSeries(list);
  t("feed: the original list isn't changed", JSON.stringify(list) === before);
}

// ───────── nudging the host to add dates ─────────
{
  const NOW = new Date("2026-10-20T12:00:00Z");
  const ev = (id: string, series: string | null, at: string, cancelled = false) => ({ id, series_id: series, starts_at: at, cancelled_at: cancelled ? "2026-10-01T00:00:00Z" : null, repeat_every: 7 });
  const running = [ev("r1", "A", "2026-10-06T18:00:00Z"), ev("r2", "A", "2026-10-13T18:00:00Z"), ev("r3", "A", "2026-10-27T18:00:00Z")];
  t("nudge: a series that still has a date ahead needs nothing", seriesNeedingMoreDates(running, NOW).length === 0);
  const finished = [ev("f1", "B", "2026-10-06T18:00:00Z"), ev("f2", "B", "2026-10-13T18:00:00Z")];
  t("nudge: a series that just ran out of dates is offered more (from its last date)", seriesNeedingMoreDates(finished, NOW).map((x) => x.id).join() === "f2");
  t("nudge: an old, long-finished series is left alone", seriesNeedingMoreDates([ev("o1", "C", "2026-05-01T18:00:00Z")], NOW).length === 0);
  t("nudge: a series the host cancelled altogether is not nagged about", seriesNeedingMoreDates([ev("x1", "D", "2026-10-06T18:00:00Z", true), ev("x2", "D", "2026-10-13T18:00:00Z", true)], NOW).length === 0);
  t("nudge: cancelled later dates don't count as dates ahead", seriesNeedingMoreDates([ev("y1", "E", "2026-10-13T18:00:00Z"), ev("y2", "E", "2026-10-27T18:00:00Z", true)], NOW).map((x) => x.id).join() === "y1");
  t("nudge: one-off meetups are never mentioned", seriesNeedingMoreDates([ev("s", null, "2026-10-13T18:00:00Z")], NOW).length === 0);
  t("nudge: several finished series are listed, most recent first", seriesNeedingMoreDates([...finished, ev("g1", "G", "2026-10-15T18:00:00Z")], NOW).map((x) => x.id).join() === "g1,f2");
}

// ───────── posting again ─────────
{
  const NOW = new Date("2026-10-20T12:00:00Z"); // a Tuesday
  t("post again: the same weekday and time, a week on", suggestNextStart("2026-10-08T18:30:00Z", 7, NOW) === "2026-10-22T11:30" || local("2026-10-08T18:30:00Z").slice(11) === suggestNextStart("2026-10-08T18:30:00Z", 7, NOW)!.slice(11));
  const s1 = suggestNextStart("2026-09-24T01:30:00Z", 7, NOW)!; // that's Wednesday Sep 23, 6:30 PM in Pacific time
  const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
  t("post again: an old meetup is moved forward until it's in the future, keeping its Pacific weekday and time", local("2026-09-24T01:30:00Z") === "2026-09-23T18:30" && s1.endsWith("T18:30") && weekday(s1.slice(0, 10)) === weekday("2026-09-23") && s1 > "2026-10-20T13:00", s1);
  t("post again: every two weeks skips a week", suggestNextStart("2026-10-15T01:30:00Z", 14, NOW)!.endsWith("T18:30") && suggestNextStart("2026-10-15T01:30:00Z", 14, NOW)! >= "2026-10-28");
  t("post again: a future meetup gets the following week (not the same day)", suggestNextStart("2026-10-27T01:30:00Z", 7, NOW)! > "2026-10-27T18:30");
  t("post again: bad input gives nothing", suggestNextStart("garbage", 7, NOW) === null && suggestNextStart("2026-10-08T18:30:00Z", 5, NOW) === null);
}

// ───────── the doors ─────────
{
  const actions = read("app/actions.ts");
  const create = actions.slice(actions.indexOf("export async function createEvent"), actions.indexOf("export async function cancelSeries"));
  const single = create.slice(create.indexOf("if (!repeatEvery) {"), create.indexOf("} else {"));
  t("posting: a one-off meetup never touches the new columns (so it works even before the database update)", !/series_id|repeat_every/.test(single) && /\.insert\(\{/.test(single));
  const series = create.slice(create.indexOf("} else {"), create.indexOf("const ids = created.map"));
  t("posting: a series is one bulk insert with a fresh series id, and refuses (undoing any) if it can't create every date", /crypto\.randomUUID\(\)/.test(series) && /starts\.map\(\(iso\) => \(\{/.test(series) && /series_id: seriesId/.test(series) && /data\.length !== starts\.length/.test(series) && /\.delete\(\)\.in\("id"/.test(series));
  t("posting: if the database update hasn't been run, a repeating post says so plainly and logs what to run", /PGRST204/.test(series) && /019_retention_features\.sql/.test(series) && /Repeating meetups aren't available right now/.test(series));
  t("posting: approval-only series get a private location for EVERY date, and everything is undone if that fails", /ids\.map\(\(id\) => \(\{ event_id: id, venue_name: input\.venue_name/.test(create) && /\.delete\(\)\.in\("id", ids\)/.test(create));
  t("posting: it goes to the first date's page", /redirect\(`\/events\/\$\{ids\[0\]\}`\)/.test(create));
  const cs = actions.slice(actions.indexOf("export async function cancelSeries"), actions.indexOf("export type UpdateDetailsResult"));
  t("cancel series: needs a login, goes through the database function that checks ownership, and tells every affected meetup's guests", /getUser\(\)/.test(cs) && /\.rpc\("cancel_series_from"/.test(cs) && /notifyEventCancelled\(id\)/.test(cs) && /for \(const id of cancelled\)/.test(cs));
  t("cancel series: an empty result is reported, not shown as success", /nothing left to cancel/.test(cs));
  const page = read("app/events/[id]/page.tsx");
  t("meetup page: the series panel is shown for series meetups, and only the host gets the buttons", /seriesId && \(\s*\n\s*<SeriesPanel/.test(page) && /isHost=\{isHost\}/.test(page));
  t("meetup page: 'Run it again?' is for the host of a finished, uncancelled meetup", /isHost && ended && !cancelled && \(\s*\n\s*<section/.test(page) && /events\/new\?from=\$\{event\.id\}/.test(page));
  const panel = read("components/SeriesPanel.tsx");
  t("series panel: the buttons are host-only, and 'cancel all' only appears when there's more than this one", /isHost && \(/.test(panel) && /remaining\.length > 1/.test(panel));
  const np = read("app/events/new/page.tsx");
  t("post again: only YOUR OWN meetup can be copied (checked against the signed-in person)", /e && e\.host_id === user\.id/.test(np) && /UUID\.test\(from\)/.test(np));
  t("post again: the private address of an approval-only meetup is only read for its host", /e\.join_mode === "request"[\s\S]{0,300}event_locations/.test(np) && np.indexOf("e.host_id === user.id") < np.indexOf("event_locations"));
  const feed = read("app/(feed)/page.tsx");
  t("feed: series are collapsed unless the person is browsing by week or day", /if \(!filters\.week && !filters\.day\) events = collapseSeries\(events\)/.test(feed));
  t("feed: the swipe card says 'Weekly' for recurring meetups", /repeatLabel\(e\.repeat_every\)/.test(feed));
  t("Me: a series that ran out of dates gets an 'Add more dates' card", /seriesNeedingMoreDates\(hosting\)/.test(read("app/me/page.tsx")));
  t("the form has the Repeat controls, and the button says how many will be posted", /name="repeat_every"/.test(read("components/EventForm.tsx")) && /Post \$\{repeatCount/.test(read("components/EventForm.tsx")));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
