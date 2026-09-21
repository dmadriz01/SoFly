// Editing a meetup's date/time and place, telling the people who joined, and showing declined
// requests on "Me". Runs the real logic against a fake database and inbox. `npm run test:unit`.
import fs from "node:fs";
import path from "node:path";
import { eventUpdated } from "../lib/email-templates.ts";
import { describeEdit, pushSummary, type DetailChange } from "../lib/event-edit.ts";
import { notifyEventUpdated } from "../lib/notify.ts";
import { formatWhenAbsolute, pacificLocalToUtc, pacificLocalValue } from "../lib/time.ts";
import { DETAILS_FIELDS, validateEvent, validateEventDetails } from "../lib/validation.ts";
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

// ───────── the rules for a date/time and place ─────────
const future = pacificLocalValue(new Date(Date.now() + 3 * 86400000).toISOString());
const good = { starts_at: future, neighborhood: "Oakland", venue_name: "Lake Merritt", address: "1 Lake Merritt Blvd, Oakland, CA" };
{
  t("edit rules: a good date, neighborhood, venue and address pass", Object.keys(validateEventDetails(good)).length === 0, JSON.stringify(validateEventDetails(good)));
  t("edit rules: a time in the past is refused", !!validateEventDetails({ ...good, starts_at: "2020-01-01T10:00" }).starts_at);
  t("edit rules: an empty or invalid time is refused", !!validateEventDetails({ ...good, starts_at: "" }).starts_at && !!validateEventDetails({ ...good, starts_at: "tomorrow" }).starts_at && !!validateEventDetails({ ...good, starts_at: "2027-13-45T10:00" }).starts_at);
  t("edit rules: a neighborhood that isn't in the list is refused", !!validateEventDetails({ ...good, neighborhood: "Atlantis" }).neighborhood && !!validateEventDetails({ ...good, neighborhood: "" }).neighborhood);
  t("edit rules: the venue can't be empty or over 100 characters", !!validateEventDetails({ ...good, venue_name: "  " }).venue_name && !!validateEventDetails({ ...good, venue_name: "v".repeat(101) }).venue_name && !validateEventDetails({ ...good, venue_name: "v".repeat(100) }).venue_name);
  t("edit rules: the address can't be empty or over 200 characters", !!validateEventDetails({ ...good, address: "" }).address && !!validateEventDetails({ ...good, address: "a".repeat(201) }).address && !validateEventDetails({ ...good, address: "a".repeat(200) }).address);
  t("edit rules: missing fields are reported, not ignored", Object.keys(validateEventDetails({})).sort().join() === [...DETAILS_FIELDS].sort().join());
  // posting a meetup must judge these four fields identically (one shared rule each)
  const post = (o: Record<string, string>) => validateEvent({ title: "t", category: "Yoga", description: "", max_spots: "5", skill_level: "All levels", audience: "Everyone", join_mode: "open", age_min: "", age_max: "", chat_url: "", ...good, ...o });
  t("posting: still accepts a good meetup", Object.keys(post({})).length === 0, JSON.stringify(post({})));
  t("posting and editing give the same message for each of the four fields", (["starts_at", "neighborhood", "venue_name", "address"] as const).every((f) => post({ [f]: "" })[f] === validateEventDetails({ ...good, [f]: "" })[f] && !!post({ [f]: "" })[f]));
  t("posting: errors still come in the order the form focuses them (title, category, neighborhood, venue, address, time)", Object.keys(post({ title: "", category: "", neighborhood: "", venue_name: "", address: "", starts_at: "" })).join() === "title,category,neighborhood,venue_name,address,starts_at");
}

// ───────── the time shown in the box ─────────
{
  const roundTrips = ["2026-03-08T09:30", "2026-03-08T12:00", "2026-11-01T00:30", "2026-11-01T09:00", "2026-07-04T18:45", "2027-01-15T12:00", "2026-12-31T23:59"];
  t("time box: what the box shows converts back to the very same moment (including around both clock changes)", roundTrips.every((v) => { const d = pacificLocalToUtc(v); return d !== null && pacificLocalValue(d.toISOString()) === v; }), roundTrips.filter((v) => pacificLocalValue(pacificLocalToUtc(v)!.toISOString()) !== v).join());
  t("time box: a stored UTC time is shown in Pacific (summer and winter)", pacificLocalValue("2026-09-26T14:00:00Z") === "2026-09-26T07:00" && pacificLocalValue("2026-01-15T15:00:00+00:00") === "2026-01-15T07:00");
  t("time box: saving without touching the time doesn't move it", pacificLocalToUtc(pacificLocalValue("2026-09-26T14:00:00Z"))!.toISOString() === "2026-09-26T14:00:00.000Z");
  t("time text: always the real day, never 'Today' or 'Tomorrow'", formatWhenAbsolute("2026-09-26T14:00:00Z") === "Sat, Sep 26 · 7:00 AM", formatWhenAbsolute("2026-09-26T14:00:00Z"));
}

// ───────── what counts as a change ─────────
const before = { starts_at: "2026-09-26T14:00:00Z", neighborhood: "Oakland", venue_name: "Lake Merritt", address: "1 Lake Merritt Blvd, Oakland, CA" };
{
  t("changes: identical means nothing to report", describeEdit(before, { ...before }).length === 0);
  t("changes: the same instant written another way isn't a change", describeEdit(before, { ...before, starts_at: "2026-09-26T07:00:00-07:00" }).length === 0);
  t("changes: extra spaces don't count as a change", describeEdit(before, { ...before, venue_name: "  Lake   Merritt " }).length === 0);
  const c = describeEdit(before, { starts_at: "2026-09-27T02:30:00Z", neighborhood: "Berkeley", venue_name: "Cesar Chavez Park", address: "11 Spinnaker Way, Berkeley, CA" });
  t("changes: every changed field is listed with old and new", c.map((x) => x.what).join() === "Time,Neighborhood,Venue,Address" && c[0].from === "Sat, Sep 26 · 7:00 AM" && c[0].to === "Sat, Sep 26 · 7:30 PM" && c[2].from === "Lake Merritt" && c[2].to === "Cesar Chavez Park", JSON.stringify(c));
  t("changes: only what changed is listed", describeEdit(before, { ...before, address: "2 Other St" }).map((x) => x.what).join() === "Address");
  t("push wording: says what kind of change, and never the address or venue", (() => {
    const all = describeEdit(before, { starts_at: "2026-09-27T02:30:00Z", neighborhood: "Berkeley", venue_name: "Secret Court", address: "9 Private Rd" });
    const texts = [pushSummary(all), pushSummary(all.filter((x) => x.what === "Time")), pushSummary(all.filter((x) => x.what === "Venue"))];
    return texts.every((s) => !/Secret|Private|Berkeley/.test(s)) && /time and the place/.test(texts[0]) && /the time\./.test(texts[1]) && /the place/.test(texts[2]);
  })());
}

// ───────── the email ─────────
{
  const changes: DetailChange[] = [{ what: "Time", from: "Sat, Sep 26 · 7:00 AM", to: "Sat, Sep 26 · 7:30 PM" }, { what: "Venue", from: "Old <b>Park</b>", to: "New Park" }];
  const m = eventUpdated({ name: "Ana", eventTitle: "Sunrise <script>alert(1)</script> run", changes, when: "Saturday, September 26 at 7:30 PM PDT", eventUrl: "https://bay-meet.vercel.app/events/e1", siteUrl: "https://bay-meet.vercel.app" });
  t("email: subject and greeting name the meetup", m.subject.startsWith("Updated: Sunrise") && m.text.includes("Hi Ana, the host changed the details"));
  t("email: it lists each change with old and new, and the new time", m.text.includes("Time: Sat, Sep 26 · 7:00 AM → Sat, Sep 26 · 7:30 PM") && m.text.includes("Venue: Old <b>Park</b> → New Park") && m.text.includes("It's now on Saturday, September 26 at 7:30 PM PDT"));
  t("email: points to the meetup and tells them they can leave", m.text.includes("https://bay-meet.vercel.app/events/e1") && /leave the meetup/.test(m.text));
  t("email: anything a person typed is escaped in the HTML version", !m.html.includes("<script>") && !m.html.includes("<b>Park</b>") && m.html.includes("&lt;script&gt;"));
}

// ───────── who is told ─────────
const NOW = new Date("2026-09-20T19:00:00Z");
const users = { host: { email: "host@example.com" }, ann: { email: "ann@example.com" }, bob: { email: "bob@example.com" }, cy: { email: "cy@example.com" }, dee: { email: "dee@example.com" } };
const base = (): FakeData => ({
  events: [{ id: "ev1", title: "Pickeball", starts_at: "2026-09-26T14:00:00Z", host_id: "host", join_mode: "request", venue_name: "Shared after approval", address: "Oakland", cancelled_at: null }],
  event_locations: [{ event_id: "ev1", venue_name: "Court 3", address: "1 Main St, Oakland, CA" }],
  rsvps: [
    { event_id: "ev1", user_id: "host", status: "approved" },
    { event_id: "ev1", user_id: "ann", status: "approved" },
    { event_id: "ev1", user_id: "cy", status: "approved" },
    { event_id: "ev1", user_id: "bob", status: "pending" },
    { event_id: "ev1", user_id: "dee", status: "declined" },
  ],
  profiles: [{ id: "host", name: "David Madriz" }, { id: "ann", name: "Ann Lee" }, { id: "bob", name: "Bob Ray" }, { id: "cy", name: "Cy Ng" }, { id: "dee", name: "Dee Fox" }],
  user_settings: [],
});
const recorder = () => {
  const sent: { to: string; title: string; body: string; url: string; tag: string }[] = [];
  return { sent, push: async (to: string, p: { title: string; body: string; url?: string; tag?: string }) => { sent.push({ to, title: p.title, body: p.body, url: p.url ?? "", tag: p.tag ?? "" }); return { sent: 1, removed: 0, failed: 0 }; } };
};
const change = describeEdit(before, { starts_at: "2026-09-27T02:30:00Z", neighborhood: "Oakland", venue_name: "Secret Court", address: "9 Private Rd, Oakland, CA" });
{
  const box = fakeMailbox(); const r = recorder();
  await silently(() => notifyEventUpdated("ev1", change, { admin: fakeAdmin(base(), users), send: box.send, push: r.push, now: NOW }));
  t("told: every approved guest gets an email, and nobody else", box.sent.map((m) => m.to).sort().join() === "ann@example.com,cy@example.com", JSON.stringify(box.sent.map((m) => m.to)));
  t("told: not the host, and not someone whose request is pending or was declined", !box.sent.some((m) => ["host@example.com", "bob@example.com", "dee@example.com"].includes(m.to)));
  t("told: every approved guest also gets a push, which opens the meetup", r.sent.map((x) => x.to).sort().join() === "ann,cy" && r.sent.every((x) => x.url === "/events/ev1" && x.title === "Updated: Pickeball"), JSON.stringify(r.sent));
  t("told: the push never carries the private address or venue", !JSON.stringify(r.sent).includes("Secret") && !JSON.stringify(r.sent).includes("Private") && !JSON.stringify(r.sent).includes("Main St"));
  t("told: a newer update replaces an older one on the phone (same tag)", new Set(r.sent.map((x) => x.tag)).size === 1 && r.sent[0].tag === "updated-ev1");
  t("told: the email says what changed from and to", /Time: Sat, Sep 26 · 7:00 AM → Sat, Sep 26 · 7:30 PM/.test(box.sent[0].text) && box.sent[0].text.includes("Venue: Lake Merritt → Secret Court"), box.sent[0].text);
}
{
  const d = base(); d.user_settings.push({ user_id: "ann", email_notifications: false });
  const box = fakeMailbox(); const r = recorder();
  await silently(() => notifyEventUpdated("ev1", change, { admin: fakeAdmin(d, users), send: box.send, push: r.push, now: NOW }));
  t("told: a guest with emails off gets no email but still gets the push", box.sent.map((m) => m.to).join() === "cy@example.com" && r.sent.map((x) => x.to).sort().join() === "ann,cy");
  const box2 = fakeMailbox((to) => (to === "ann@example.com" ? "fail" : "ok")); const r2 = recorder();
  await silently(() => notifyEventUpdated("ev1", change, { admin: fakeAdmin(base(), users), send: box2.send, push: r2.push, now: NOW }));
  t("told: one failed email doesn't stop the others, and the push still goes out", box2.sent.map((m) => m.to).join() === "cy@example.com" && r2.sent.length === 2);
  const box3 = fakeMailbox(); const r3 = recorder();
  await silently(() => notifyEventUpdated("ev1", [], { admin: fakeAdmin(base(), users), send: box3.send, push: r3.push, now: NOW }));
  t("told: nothing changed means nobody is told", box3.sent.length === 0 && r3.sent.length === 0);
  const started = fakeMailbox();
  await silently(() => notifyEventUpdated("ev1", change, { admin: fakeAdmin(base(), users), send: started.send, now: new Date("2026-09-26T15:00:00Z") }));
  t("told: a meetup that already started notifies nobody", started.sent.length === 0);
  const dc = base(); (dc.events[0] as { cancelled_at: unknown }).cancelled_at = "2026-09-21T00:00:00Z";
  const cancelled = fakeMailbox();
  await silently(() => notifyEventUpdated("ev1", change, { admin: fakeAdmin(dc, users), send: cancelled.send, now: NOW }));
  t("told: a cancelled meetup notifies nobody", cancelled.sent.length === 0);
  const solo = base(); solo.rsvps = [{ event_id: "ev1", user_id: "host", status: "approved" }];
  const soloBox = fakeMailbox();
  await silently(() => notifyEventUpdated("ev1", change, { admin: fakeAdmin(solo, users), send: soloBox.send, now: NOW }));
  t("told: a meetup nobody has joined notifies nobody", soloBox.sent.length === 0);
  let threw = false;
  try { await silently(async () => { await notifyEventUpdated("ev1", change, { admin: null }); await notifyEventUpdated("nope", change, { admin: fakeAdmin(base(), users), now: NOW }); }); } catch { threw = true; }
  t("told: with no server key, or an unknown meetup, it quietly does nothing", !threw);
}

// ───────── the doors: the action, the page and the button ─────────
{
  const actions = read("app/actions.ts");
  const body = actions.slice(actions.indexOf("export async function updateEventDetails"), actions.indexOf("export async function setRsvp"));
  const at = (needle: string) => body.indexOf(needle);
  t("action: it needs a logged-in person", at("auth.getUser()") > -1 && at('redirect(`/login?next=/events/${eventId}/edit`)') > -1 && at("getUser") < at("validateEventDetails"));
  t("action: the input is validated before anything is read or written", at("validateEventDetails(input)") > -1 && at("validateEventDetails(input)") < at('.from("events")') && at('.from("events")') < at("update_event_details"));
  t("action: it checks the person is the host, and that the meetup isn't cancelled or started, before saving", at("event.host_id !== user.id") > -1 && at("event.host_id !== user.id") < at("update_event_details") && at("event.cancelled_at") < at("update_event_details") && at("<= Date.now()") < at("update_event_details"));
  t("action: it saves through the one database function (all or nothing), not separate writes", at('.rpc("update_event_details"') > -1 && !/\.from\("events"\)\s*\.update|\.from\("event_locations"\)\s*\.(update|insert|upsert)/.test(body));
  t("action: if the database update hasn't been run yet, the host gets a plain message and the owner gets a clear log line", /PGRST202/.test(body) && /017_update_event_details\.sql/.test(body) && /Editing isn't available right now/.test(body));
  t("action: nothing changed is reported, not saved or announced", at("You haven't changed anything") > -1 && at("You haven't changed anything") < at("update_event_details"));
  t("action: guests are told only AFTER the save succeeded (after the error check)", at("notifyEventUpdated(") > at("if (error)") && at("notifyEventUpdated(") > at("update_event_details"));
  t("action: it then goes back to the meetup", at("redirect(`/events/${eventId}?edited=1`)") > at("notifyEventUpdated("));

  const edit = read("app/events/[id]/edit/page.tsx");
  t("edit page: logged-out visitors are sent to log in and back", /if \(!user\) redirect\(`\/login\?next=\/events\/\$\{params\.id\}\/edit`\)/.test(edit));
  t("edit page: anyone but the host is sent back to the meetup, before any form is built", edit.indexOf("event.host_id !== user.id") > -1 && edit.indexOf("event.host_id !== user.id") < edit.indexOf("<EditEventForm"));
  t("edit page: cancelled and started meetups can't be edited, and it isn't indexed", edit.indexOf("event.cancelled_at") < edit.indexOf("<EditEventForm") && edit.indexOf("<= Date.now()") < edit.indexOf("<EditEventForm") && /index: false/.test(edit));
  t("edit page: the private address of an approval-only meetup is read from the private location (host only)", /isRequest[\s\S]{0,200}event_locations/.test(edit));

  const page = read("app/events/[id]/page.tsx");
  t("meetup page: the Edit button is for the host of a live meetup only", /isHost && !cancelled && !ended && \(\s*\n\s*<Link href=\{`\/events\/\$\{event\.id\}\/edit`\}/.test(page));
  t("meetup page: the 'Saved' banner is for the host only", /isHost && searchParams\.edited === "1" && !cancelled/.test(page));

  const me = read("app/me/page.tsx");
  t("Me: requests the host declined are fetched too (they no longer drop off)", /\.in\("status", \["approved", "pending", "declined"\]\)/.test(me) && !/declined request just drops off/.test(me));
  t("Me: declined requests are kept out of 'Going to' and shown in their own section", /events=\{going\.filter\(\(e\) => statusByEvent\[e\.id\] !== "declined"\)\}/.test(me) && /<h2[^>]*>Declined<\/h2>/.test(me) && /myStatus="declined"/.test(me));
  t("Me: 'next up' and the rating prompt still only use approved meetups", /statusByEvent\[e\.id\] === "approved" && e\.host_id !== user\.id\)\s*\n\s*\.map\(\(e\) => \(\{ e, role: "going"/.test(me) && /statusByEvent\[e\.id\] === "approved" &&\s*\n\s*e\.host_id !== user\.id &&/.test(me));
  t("Me: the card shows a 'Declined' badge", /myStatus === "declined"[\s\S]{0,200}Declined/.test(read("components/EventCard.tsx")));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
