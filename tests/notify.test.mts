// Tests the real email logic (who gets emailed, when, and why someone is skipped) against a fake
// database and inbox. Run with `npm run test:unit`.
import { diagnoseEmail } from "../lib/diagnose.ts";
import { notifyEventCancelled, notifyHostOfRequest, notifyRequestDecision, sendDailyEmails } from "../lib/notify.ts";
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
  await silently(() => notifyEventCancelled("ev1", { admin: fakeAdmin(d, users), send: box.send }));
  t("a cancellation emails approved guests only (not the host, not pending requesters)", box.sent.length === 1 && box.sent[0].to === "ann@example.com", JSON.stringify(box.sent.map((m) => m.to)));
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
  t("diagnostic: everything set up -> all checks pass and a test email is sent", failing("", c) === "(none)" && box.sent.length === 1 && box.sent[0].to === "host@example.com" && box.sent[0].subject === "BayMeet test email", failing("", c));

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
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
