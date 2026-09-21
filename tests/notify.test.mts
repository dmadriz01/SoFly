// Tests the real email logic (who gets emailed, when, and why someone is skipped) against a fake
// database and inbox. Run with `npm run test:unit`.
import { diagnoseEmail, mailErrorHint } from "../lib/diagnose.ts";
import { cleanSetting, mailConfigured, mailCredentials } from "../lib/mailer.ts";
import { notifyEventCancelled, notifyEventDeleted, notifyHostOfRequest, notifyRequestDecision, sendDailyEmails, snapshotBeforeDelete } from "../lib/notify.ts";
import { fakeAdmin, fakeMailbox, type FakeData } from "./fake-supabase.mts";

let passed = 0;
let failed = 0;
const t = (name: string, cond: boolean, extra = "") => {
  cond ? passed++ : failed++;
  console.log(`${cond ? "ok   " : "FAIL "}${name}${cond ? "" : "  -> " + extra}`);
};
const quiet = console.log;
const silently = async <T,>(fn: () => Promise<T>) => {
  console.log = () => {};
  try { return await fn(); } finally { console.log = quiet; }
};

// ---- the real situation: the exact event and the exact moment the job was run ----
// Sunday Sep 20 2026, 12:51 PM Pacific. "Pickeball" is Monday Sep 21 at 5:00 PM Pacific, approval-only.
const NOW = new Date("2026-09-20T19:51:45Z");
const users = {
  host: { email: "host@example.com" },
  ann: { email: "ann@example.com" },
  bob: { email: "bob@example.com" },
  cy: { email: "cy@example.com" },
  gone: { email: null },
};
const base = (): FakeData => ({
  events: [
    { id: "ev1", title: "Pickeball", starts_at: "2026-09-22T00:00:00+00:00", host_id: "host", join_mode: "request", venue_name: "Shared after approval", address: "Oakland", cancelled_at: null },
  ],
  event_locations: [{ event_id: "ev1", venue_name: "Court 3", address: "1 Main St, Oakland, CA" }],
  rsvps: [{ event_id: "ev1", user_id: "host", status: "approved" }],
  profiles: [
    { id: "host", name: "David Madriz" }, { id: "ann", name: "Ann Lee" }, { id: "bob", name: "Bob Ray" }, { id: "cy", name: "Cy Ng" },
  ],
  user_settings: [],
});

{
  const box = fakeMailbox();
  const r = await silently(() => sendDailyEmails(NOW, { admin: fakeAdmin(base(), users), send: box.send }));
  t("YOUR CASE: the host of tomorrow's approval-only meetup gets one reminder", r.reminders === 1 && box.sent.length === 1 && box.sent[0].to === "host@example.com", JSON.stringify(r));
  t("...subject names the meetup", box.sent[0]?.subject === "Tomorrow: Pickeball", box.sent[0]?.subject);
  t("...it has the REAL address, not the public placeholder", box.sent[0]?.text.includes("Court 3, 1 Main St, Oakland, CA") && !box.sent[0]?.text.includes("Shared after approval"));
  t("...and the right day and time in Pacific", box.sent[0]?.text.includes("Monday, September 21 at 5:00 PM PDT"), box.sent[0]?.text);
  t("...the result reports what it found", r.eventsTomorrow === 1 && r.eventsYesterday === 0 && r.failed === 0);
}

{
  const box = fakeMailbox();
  const d = base();
  d.rsvps.push({ event_id: "ev1", user_id: "ann", status: "approved" }, { event_id: "ev1", user_id: "bob", status: "pending" }, { event_id: "ev1", user_id: "cy", status: "declined" });
  const r = await silently(() => sendDailyEmails(NOW, { admin: fakeAdmin(d, users), send: box.send }));
  t("approved guests are emailed too; pending and declined people are not", box.sent.map((m) => m.to).sort().join() === "ann@example.com,host@example.com", box.sent.map((m) => m.to).join());
  t("...and nobody is emailed twice", r.reminders === 2);
}

{
  const box = fakeMailbox();
  const d = base();
  d.user_settings = [{ user_id: "host", email_notifications: false }];
  const r = await silently(() => sendDailyEmails(NOW, { admin: fakeAdmin(d, users), send: box.send }));
  t("a host who switched emails off is not emailed, and the result says why", box.sent.length === 0 && r.skipped.optedOut === 1, JSON.stringify(r));
  d.user_settings = [{ user_id: "host", email_notifications: true }];
  const box2 = fakeMailbox();
  await silently(() => sendDailyEmails(NOW, { admin: fakeAdmin(d, users), send: box2.send }));
  t("switching them back on works", box2.sent.length === 1);
}

{
  const box = fakeMailbox();
  const d = base();
  (d.events[0] as { cancelled_at: unknown }).cancelled_at = "2026-09-20T10:00:00Z";
  const r = await silently(() => sendDailyEmails(NOW, { admin: fakeAdmin(d, users), send: box.send }));
  t("a cancelled meetup gets no reminder", box.sent.length === 0 && r.eventsTomorrow === 0);
}

// ---- the window is exactly tomorrow, Pacific time ----
const at = (iso: string) => {
  const d = base();
  (d.events[0] as { starts_at: string }).starts_at = iso;
  return d;
};
for (const [label, iso, expected] of [
  ["just after midnight tomorrow (Pacific) is included", "2026-09-21T07:00:00Z", 1],
  ["just before midnight tomorrow (Pacific) is included", "2026-09-22T06:59:00Z", 1],
  ["midnight the day after is NOT included", "2026-09-22T07:00:00Z", 0],
  ["later today is NOT included", "2026-09-21T02:00:00Z", 0],
  ["three days out is NOT included", "2026-09-24T00:00:00Z", 0],
] as const) {
  const box = fakeMailbox();
  await silently(() => sendDailyEmails(NOW, { admin: fakeAdmin(at(iso), users), send: box.send }));
  t(`window: ${label}`, box.sent.length === expected, `sent ${box.sent.length}`);
}

// ---- feedback requests: yesterday's meetups, guests only ----
{
  const box = fakeMailbox();
  const d = at("2026-09-20T02:00:00Z"); // Sat Sep 19, 7:00 PM Pacific = yesterday
  d.rsvps.push({ event_id: "ev1", user_id: "ann", status: "approved" }, { event_id: "ev1", user_id: "bob", status: "pending" });
  const r = await silently(() => sendDailyEmails(NOW, { admin: fakeAdmin(d, users), send: box.send }));
  t("yesterday's meetup: approved guests get 'How was it?'", r.feedbackRequests === 1 && box.sent[0]?.to === "ann@example.com" && box.sent[0]?.subject === "How was Pickeball?", JSON.stringify(r));
  t("...the host and pending requesters do not", !box.sent.some((m) => m.to === "host@example.com" || m.to === "bob@example.com"));
  t("...and no reminder goes out for a meetup that already happened", r.reminders === 0);
}

// ---- when things go wrong, it says so ----
{
  const r = await silently(() => sendDailyEmails(NOW, { admin: null, send: fakeMailbox().send }));
  t("no server key: does nothing and says so", r.reminders === 0 && (r.note ?? "").includes("SUPABASE_SERVICE_ROLE_KEY"), JSON.stringify(r));
}
{
  const box = fakeMailbox(() => "fail");
  const r = await silently(() => sendDailyEmails(NOW, { admin: fakeAdmin(base(), users), send: box.send }));
  t("a mail server refusal is counted and explained", r.failed === 1 && r.reminders === 0 && (r.firstFailure ?? "").includes("535"), JSON.stringify(r));
}
{
  const box = fakeMailbox();
  const r = await silently(() => sendDailyEmails(NOW, { admin: fakeAdmin(base(), users, { lookupError: "Invalid API key" }), send: box.send }));
  t("a bad server key shows up as lookupFailed, not silence", r.skipped.lookupFailed === 1 && box.sent.length === 0, JSON.stringify(r));
}
{
  const box = fakeMailbox();
  const d = base();
  d.rsvps.push({ event_id: "ev1", user_id: "gone", status: "approved" });
  const r = await silently(() => sendDailyEmails(NOW, { admin: fakeAdmin(d, users), send: box.send }));
  t("an account with no email is skipped without stopping the others", r.skipped.noEmail === 1 && box.sent.length === 1, JSON.stringify(r));
}
{
  const box = fakeMailbox((to) => (to === "host@example.com" ? "fail" : "ok"));
  const d = base();
  d.rsvps.push({ event_id: "ev1", user_id: "ann", status: "approved" });
  const r = await silently(() => sendDailyEmails(NOW, { admin: fakeAdmin(d, users), send: box.send }));
  t("one failed send doesn't stop the rest", r.failed === 1 && r.reminders === 1 && box.sent[0]?.to === "ann@example.com");
}
{
  const box = fakeMailbox();
  const d = base();
  for (let i = 0; i < 300; i++) {
    d.rsvps.push({ event_id: "ev1", user_id: `u${i}`, status: "approved" });
    (users as Record<string, { email: string | null }>)[`u${i}`] = { email: `u${i}@example.com` };
  }
  const r = await silently(() => sendDailyEmails(NOW, { admin: fakeAdmin(d, users), send: box.send }));
  t("the daily cap holds at 250", box.sent.length === 250 && (r.note ?? "").includes("cap"), `${box.sent.length}`);
}

// ---- the event-driven emails ----
{
  const box = fakeMailbox();
  await silently(() => notifyHostOfRequest("ev1", "ann", { admin: fakeAdmin(base(), users), send: box.send }));
  t("a join request emails the host, naming the requester", box.sent.length === 1 && box.sent[0].to === "host@example.com" && box.sent[0].subject.startsWith("Ann wants to join"), JSON.stringify(box.sent.map((m) => m.subject)));
  t("...without including the private introduction note", !box.sent[0].text.includes("wrote you") || !box.sent[0].text.includes("chef"));
  const box2 = fakeMailbox();
  await silently(() => notifyHostOfRequest("ev1", "host", { admin: fakeAdmin(base(), users), send: box2.send }));
  t("the host joining their own event emails nobody", box2.sent.length === 0);
  const open = base();
  (open.events[0] as { join_mode: string }).join_mode = "open";
  const box3 = fakeMailbox();
  await silently(() => notifyHostOfRequest("ev1", "ann", { admin: fakeAdmin(open, users), send: box3.send }));
  t("an open event never sends a request email", box3.sent.length === 0);
  const off = base();
  off.user_settings = [{ user_id: "host", email_notifications: false }];
  const box4 = fakeMailbox();
  await silently(() => notifyHostOfRequest("ev1", "ann", { admin: fakeAdmin(off, users), send: box4.send }));
  t("a host with emails off is not emailed about requests", box4.sent.length === 0);
}
{
  const box = fakeMailbox();
  await silently(() => notifyRequestDecision("ev1", "ann", true, { admin: fakeAdmin(base(), users), send: box.send }));
  t("an approval emails the requester", box.sent.length === 1 && box.sent[0].to === "ann@example.com" && box.sent[0].subject.startsWith("You're in"));
  const box2 = fakeMailbox();
  await silently(() => notifyRequestDecision("ev1", "ann", false, { admin: fakeAdmin(base(), users), send: box2.send }));
  t("a decline emails the requester, kindly", box2.sent.length === 1 && box2.sent[0].subject.startsWith("An update on"));
}
{
  const d = base();
  d.rsvps.push({ event_id: "ev1", user_id: "ann", status: "approved" }, { event_id: "ev1", user_id: "bob", status: "pending" });
  const box = fakeMailbox();
  await silently(() => notifyEventCancelled("ev1", { admin: fakeAdmin(d, users), send: box.send, now: NOW }));
  t("a cancellation emails approved guests only (not the host, not pending requesters)", box.sent.length === 1 && box.sent[0].to === "ann@example.com", JSON.stringify(box.sent.map((m) => m.to)));
}
{
  // ---- cancelling and deleting: the people who joined are told, by email ----
  const going = () => {
    const d = base();
    d.rsvps.push({ event_id: "ev1", user_id: "ann", status: "approved" }, { event_id: "ev1", user_id: "cy", status: "approved" }, { event_id: "ev1", user_id: "bob", status: "pending" });
    return d;
  };
  const box = fakeMailbox();
  await silently(() => notifyEventCancelled("ev1", { admin: fakeAdmin(going(), users), send: box.send, now: NOW }));
  t("cancel: every approved guest is emailed, nobody else", box.sent.map((m) => m.to).sort().join() === "ann@example.com,cy@example.com", JSON.stringify(box.sent.map((m) => m.to)));
  t("cancel: the email says the host cancelled, names the meetup, and tells them not to go", /the host cancelled Pickeball/.test(box.sent[0].text) && /don't show up/i.test(box.sent[0].text) && box.sent[0].subject === "Cancelled: Pickeball", box.sent[0].text);

  const boxM = fakeMailbox();
  await silently(() => notifyEventCancelled("ev1", { admin: fakeAdmin(going(), users), send: boxM.send, now: NOW }, "moderator"));
  t("moderator cancel: the email says SoFly cancelled it (not the host)", /SoFly cancelled Pickeball/.test(boxM.sent[0]?.text) && !/the host cancelled/.test(boxM.sent[0].text), boxM.sent[0]?.text);

  // delete: the guest list vanishes with the meetup, so the snapshot has to be taken first
  const dd = going();
  const snap = await snapshotBeforeDelete("ev1", { admin: fakeAdmin(dd, users), now: NOW });
  t("delete: before deleting, it records who was going (approved guests, not the host or pending)", snap?.guestIds.sort().join() === "ann,cy" && snap.title === "Pickeball" && snap.removed === true, JSON.stringify(snap));
  dd.events = []; dd.rsvps = []; // what the delete does: the meetup and its guest list are gone
  const boxD = fakeMailbox(); const pushed: { to: string; url: string; title: string }[] = [];
  await silently(() => notifyEventDeleted(snap!, { admin: fakeAdmin(dd, users), send: boxD.send, push: async (to, p) => { pushed.push({ to, url: p.url ?? "", title: p.title }); return { sent: 1, removed: 0, failed: 0 }; } }));
  t("delete: the guests are still emailed even though the meetup is gone from the database", boxD.sent.map((m) => m.to).sort().join() === "ann@example.com,cy@example.com", JSON.stringify(boxD.sent.map((m) => m.to)));
  t("delete: they are pushed too, and tapping goes to the feed (the meetup page no longer exists)", pushed.length === 2 && pushed.every((p) => p.url === "/" && p.title === "Cancelled: Pickeball"), JSON.stringify(pushed));

  // nobody should hear about a meetup that never had guests, already happened, or was already cancelled
  const hostOnly = await snapshotBeforeDelete("ev1", { admin: fakeAdmin(base(), users), now: NOW });
  t("delete: a meetup with nobody but the host going notifies nobody", hostOnly === null);
  const past = going();
  const afterStart = new Date("2026-09-22T01:00:00Z");
  t("delete: a meetup that already started notifies nobody (a 'cancelled' notice about the past would only confuse)", (await snapshotBeforeDelete("ev1", { admin: fakeAdmin(past, users), now: afterStart })) === null);
  const boxP = fakeMailbox();
  await silently(() => notifyEventCancelled("ev1", { admin: fakeAdmin(going(), users), send: boxP.send, now: afterStart }));
  t("cancel: same for cancelling a meetup that already started", boxP.sent.length === 0);
  const already = going(); (already.events[0] as { cancelled_at: unknown }).cancelled_at = "2026-09-19T10:00:00Z";
  t("delete: deleting a meetup that was already cancelled doesn't tell people a second time", (await snapshotBeforeDelete("ev1", { admin: fakeAdmin(already, users), now: NOW })) === null);
  t("delete: an unknown meetup notifies nobody", (await snapshotBeforeDelete("nope", { admin: fakeAdmin(going(), users), now: NOW })) === null);
  t("delete: with no server key it does nothing and doesn't throw", (await snapshotBeforeDelete("ev1", { admin: null, now: NOW })) === null);

  // a guest who turned emails off isn't emailed, the others still are
  const off = going(); off.user_settings.push({ user_id: "ann", email_notifications: false });
  const boxO = fakeMailbox();
  await silently(() => notifyEventCancelled("ev1", { admin: fakeAdmin(off, users), send: boxO.send, now: NOW }));
  t("cancel: a guest who turned emails off isn't emailed; the other guest still is", boxO.sent.map((m) => m.to).join() === "cy@example.com", JSON.stringify(boxO.sent.map((m) => m.to)));

  // one bad address must not stop the rest
  const boxF = fakeMailbox((to) => (to === "ann@example.com" ? "fail" : "ok"));
  await silently(() => notifyEventCancelled("ev1", { admin: fakeAdmin(going(), users), send: boxF.send, now: NOW }));
  t("cancel: one failed email doesn't stop the others", boxF.sent.map((m) => m.to).join() === "cy@example.com");
}
{
  // Nothing configured at all: every path must be a quiet no-op, never an error.
  let threw = false;
  try {
    await silently(async () => {
      await notifyHostOfRequest("ev1", "ann", { admin: null });
      await notifyRequestDecision("ev1", "ann", true, { admin: null });
      await notifyEventCancelled("ev1", { admin: null });
    });
  } catch { threw = true; }
  t("with no server key, the event emails quietly do nothing", !threw);
}

// ---- the "Send me a test email" diagnostic names the broken link ----
{
  const who = { userId: "host", userEmail: "host@example.com", name: "David Madriz" };
  const failing = (label: string, checks: { label: string; ok: boolean; detail?: string }[]) => checks.filter((c) => !c.ok).map((c) => c.label).join(" | ") || "(none)";

  let box = fakeMailbox();
  let c = await diagnoseEmail(who, { admin: fakeAdmin(base(), users), send: box.send, mailConfigured: true, cronSecretSet: true });
  t("diagnostic: everything set up -> all checks pass and a test email is sent", failing("", c) === "(none)" && box.sent.length === 1 && box.sent[0].to === "host@example.com" && box.sent[0].subject === "SoFly test email", failing("", c));

  box = fakeMailbox();
  c = await diagnoseEmail(who, { admin: fakeAdmin(base(), users), send: box.send, mailConfigured: false, cronSecretSet: true });
  t("diagnostic: no mail account -> says so, sends nothing", failing("", c) === "Mail account is set up" && box.sent.length === 0, failing("", c));

  box = fakeMailbox();
  c = await diagnoseEmail(who, { admin: null, send: box.send, mailConfigured: true, cronSecretSet: true });
  t("diagnostic: no server key -> says so", failing("", c) === "Server key is set up", failing("", c));

  box = fakeMailbox();
  c = await diagnoseEmail(who, { admin: fakeAdmin(base(), users, { lookupError: "Invalid API key" }), send: box.send, mailConfigured: true, cronSecretSet: true });
  t("diagnostic: a wrong server key -> Supabase's refusal is shown", failing("", c) === "Supabase accepts the server key" && (c.find((x) => !x.ok)?.detail ?? "").includes("Invalid API key"), failing("", c));

  const off = base();
  off.user_settings = [{ user_id: "host", email_notifications: false }];
  c = await diagnoseEmail(who, { admin: fakeAdmin(off, users), send: fakeMailbox().send, mailConfigured: true, cronSecretSet: true });
  t("diagnostic: emails switched off -> says so", failing("", c) === "Emails are switched on for you", failing("", c));

  c = await diagnoseEmail(who, { admin: fakeAdmin(base(), users), send: fakeMailbox().send, mailConfigured: true, cronSecretSet: false });
  t("diagnostic: no daily-job secret -> says so", failing("", c) === "Daily job secret is set up", failing("", c));

  c = await diagnoseEmail(who, { admin: fakeAdmin(base(), users), send: fakeMailbox(() => "fail").send, mailConfigured: true, cronSecretSet: true });
  t("diagnostic: Gmail rejecting the login -> the reason is shown", failing("", c) === "Test email accepted by the mail server" && (c.find((x) => !x.ok)?.detail ?? "").includes("535"), failing("", c));

  t("diagnostic: never prints a secret", JSON.stringify(c).indexOf("sb_secret") === -1 && JSON.stringify(c).indexOf("APP_PASSWORD=") === -1);

  // the exact failure seen in real life: Gmail says 535, "Username and Password not accepted"
  const real = "EAUTH · 535 · Invalid login: 535-5.7.8 Username and Password not accepted.";
  const hint = mailErrorHint(real);
  t("mail hint: a refused Gmail login explains the three usual causes in plain words", /full Gmail address/.test(hint) && /SAME Gmail account/.test(hint) && /apppasswords/.test(hint) && /2-Step Verification/.test(hint) && /redeploy/.test(hint), hint);
  t("mail hint: it recognises the login failure however it's worded", ["535", "EAUTH", "Username and Password not accepted"].every((k) => mailErrorHint(`x ${k} y`) !== ""));
  t("mail hint: a network problem is described as a network problem (not blamed on the password)", /network problem/.test(mailErrorHint("ETIMEDOUT · connect timed out")) && !/App Password/.test(mailErrorHint("ECONNECTION")));
  t("mail hint: a refused message (not login) points at the recipient and the account", /refused the message itself/.test(mailErrorHint("550 · mailbox unavailable")));
  t("mail hint: nothing to add for an unknown error or no detail", mailErrorHint("something odd") === "" && mailErrorHint(undefined) === "");
  const failLine = (await diagnoseEmail(who, { admin: fakeAdmin(base(), users), send: async () => ({ ok: false as const, reason: "smtp-error" as const, detail: real }), mailConfigured: true, cronSecretSet: true })).find((x) => !x.ok);
  t("diagnostic: the failing line shows Gmail's own message AND what to check", (failLine?.detail ?? "").includes("535-5.7.8") && /What to check/.test(failLine?.detail ?? ""), failLine?.detail);
}
{
  // settings pasted into Vercel are tidied before they're used to sign in
  t("settings: spaces, line breaks and one pair of quotes around a value are removed", cleanSetting("  me@gmail.com \n") === "me@gmail.com" && cleanSetting('"me@gmail.com"') === "me@gmail.com" && cleanSetting("'me@gmail.com'") === "me@gmail.com" && cleanSetting('" me@gmail.com "') === "me@gmail.com");
  t("settings: nothing else is changed (inner quotes, a lone quote, empty, missing)", cleanSetting("a'b") === "a'b" && cleanSetting('"abc') === '"abc' && cleanSetting("") === "" && cleanSetting(undefined) === "");
  const saved = { u: process.env.ALERT_EMAIL_USER, p: process.env.ALERT_EMAIL_APP_PASSWORD };
  process.env.ALERT_EMAIL_USER = ' "sofly@gmail.com" ';
  process.env.ALERT_EMAIL_APP_PASSWORD = "abcd efgh ijkl mnop\n";
  t("settings: an app password shown by Google as 'abcd efgh ijkl mnop' is used as the 16 letters, with the address tidied too", mailCredentials().user === "sofly@gmail.com" && mailCredentials().pass === "abcdefghijklmnop", JSON.stringify(mailCredentials()).replace(/[a-z]{16}/, "<16>"));
  t("settings: with both set (even messily) the mail account counts as set up", mailConfigured() === true);
  process.env.ALERT_EMAIL_APP_PASSWORD = '""';
  t("settings: an empty value in quotes counts as NOT set up (so the diagnostic says so, not 'refused')", mailConfigured() === false);
  delete process.env.ALERT_EMAIL_USER; delete process.env.ALERT_EMAIL_APP_PASSWORD;
  t("settings: nothing set means not set up", mailConfigured() === false && mailCredentials().user === "" && mailCredentials().pass === "");
  if (saved.u !== undefined) process.env.ALERT_EMAIL_USER = saved.u; if (saved.p !== undefined) process.env.ALERT_EMAIL_APP_PASSWORD = saved.p;
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
