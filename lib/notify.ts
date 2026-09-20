import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as email from "./email-templates";
import { mailConfigured, sendMail, type Mail, type MailResult } from "./mailer";
import { SITE_URL } from "./site";
import { createAdminClient } from "./supabase/admin";
import { addDaysToKey, formatWhenLong, pacificDate, pacificLocalToUtc } from "./time";
import { firstName } from "./utils";

// Everything here is best effort and never throws: an email problem must not break the action
// that triggered it. With no service key or mail account configured, it all quietly does nothing.
// `deps` lets tests swap in a fake database and mailbox; production code never passes it.

export type Deps = {
  admin?: SupabaseClient | null;
  send?: (mail: Mail) => Promise<MailResult>;
};

const use = (deps: Deps) => ({
  admin: deps.admin === undefined ? createAdminClient() : deps.admin,
  send: deps.send ?? sendMail,
});

const eventUrl = (id: string) => `${SITE_URL}/events/${id}`;

type Recipient = { email: string; name: string };
type Skip = "noEmail" | "optedOut" | "lookupFailed";
type Lookup = { ok: true; to: Recipient } | { ok: false; skip: Skip };

/** Someone's email address and first name, unless they've turned emails off. */
async function recipient(admin: SupabaseClient, userId: string): Promise<Lookup> {
  const [user, settings, profile] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("user_settings").select("email_notifications").eq("user_id", userId).maybeSingle(),
    admin.from("profiles").select("name").eq("id", userId).maybeSingle(),
  ]);
  if (user.error) {
    console.error("Email lookup failed for a recipient:", user.error.message);
    return { ok: false, skip: "lookupFailed" };
  }
  const address = user.data?.user?.email;
  if (!address) return { ok: false, skip: "noEmail" };
  if (settings.data?.email_notifications === false) return { ok: false, skip: "optedOut" };
  return { ok: true, to: { email: address, name: firstName(profile.data?.name) } };
}

async function safely(label: string, work: () => Promise<void>) {
  try {
    await work();
  } catch (err) {
    console.error(`Notification failed (${label}):`, err);
  }
}

/** A person asked to join an approval-only meetup: tell the host. */
export function notifyHostOfRequest(eventId: string, requesterId: string, deps: Deps = {}) {
  return safely("request received", async () => {
    const { admin, send } = use(deps);
    if (!admin) return;
    const { data: event } = await admin.from("events").select("title, host_id, join_mode").eq("id", eventId).maybeSingle();
    if (!event || event.join_mode !== "request" || event.host_id === requesterId) return;

    const [host, requester] = await Promise.all([
      recipient(admin, event.host_id),
      admin.from("profiles").select("name").eq("id", requesterId).maybeSingle(),
    ]);
    if (!host.ok) return;
    await send({
      to: host.to.email,
      ...email.requestReceived({
        hostName: host.to.name,
        requesterName: firstName(requester.data?.name),
        eventTitle: event.title,
        eventUrl: eventUrl(eventId),
        siteUrl: SITE_URL,
      }),
    });
  });
}

/** The host approved or declined: tell the requester. */
export function notifyRequestDecision(eventId: string, userId: string, approved: boolean, deps: Deps = {}) {
  return safely("request decision", async () => {
    const { admin, send } = use(deps);
    if (!admin) return;
    const { data: event } = await admin.from("events").select("title").eq("id", eventId).maybeSingle();
    const to = await recipient(admin, userId);
    if (!event || !to.ok) return;
    await send({
      to: to.to.email,
      ...email.requestDecision({ name: to.to.name, eventTitle: event.title, approved, eventUrl: eventUrl(eventId), siteUrl: SITE_URL }),
    });
  });
}

/** The host cancelled: tell everyone who was approved to go. */
export function notifyEventCancelled(eventId: string, deps: Deps = {}) {
  return safely("event cancelled", async () => {
    const { admin, send } = use(deps);
    if (!admin) return;
    const { data: event } = await admin.from("events").select("title, starts_at, host_id").eq("id", eventId).maybeSingle();
    if (!event) return;
    const { data: guests } = await admin.from("rsvps").select("user_id").eq("event_id", eventId).eq("status", "approved");

    const when = formatWhenLong(event.starts_at);
    for (const g of (guests ?? []).filter((g) => g.user_id !== event.host_id).slice(0, 200)) {
      const to = await recipient(admin, g.user_id as string);
      if (!to.ok) continue;
      await send({
        to: to.to.email,
        ...email.eventCancelled({
          name: to.to.name,
          eventTitle: event.title,
          when: `${when.day} at ${when.time}`,
          eventUrl: eventUrl(eventId),
          siteUrl: SITE_URL,
        }),
      });
    }
  });
}

type EventRow = {
  id: string;
  title: string;
  starts_at: string;
  host_id: string;
  join_mode: string;
  venue_name: string;
  address: string;
};

/** Active meetups starting in [from, to). */
async function eventsBetween(admin: SupabaseClient, from: Date, to: Date): Promise<EventRow[]> {
  const { data } = await admin
    .from("events")
    .select("id, title, starts_at, host_id, join_mode, venue_name, address")
    .is("cancelled_at", null)
    .gte("starts_at", from.toISOString())
    .lt("starts_at", to.toISOString());
  return (data ?? []) as EventRow[];
}

async function approvedGuestIds(admin: SupabaseClient, eventId: string): Promise<string[]> {
  const { data } = await admin.from("rsvps").select("user_id").eq("event_id", eventId).eq("status", "approved");
  return (data ?? []).map((g) => g.user_id as string);
}

export type DailyResult = {
  reminders: number;
  feedbackRequests: number;
  eventsTomorrow: number;
  eventsYesterday: number;
  /** People who would have been emailed but weren't, and why. */
  skipped: Record<Skip, number>;
  /** Emails the mail server refused, with the first reason. */
  failed: number;
  firstFailure?: string;
  mailConfigured: boolean;
  note?: string;
};

/**
 * The once-a-day emails, all in Pacific time so each meetup falls into exactly one run:
 *   - reminders, to the host and approved guests of every meetup happening tomorrow
 *   - "how was it?", to the approved guests of every meetup that happened yesterday
 * The result says exactly what happened and why anyone was skipped, and is logged.
 */
export async function sendDailyEmails(now = new Date(), deps: Deps = {}): Promise<DailyResult> {
  const { admin, send } = use(deps);
  const result: DailyResult = {
    reminders: 0,
    feedbackRequests: 0,
    eventsTomorrow: 0,
    eventsYesterday: 0,
    skipped: { noEmail: 0, optedOut: 0, lookupFailed: 0 },
    failed: 0,
    mailConfigured: deps.send ? true : mailConfigured(),
  };
  const done = (note?: string) => {
    if (note) result.note = note;
    console.log("Daily emails:", JSON.stringify(result));
    return result;
  };

  if (!admin) return done("SUPABASE_SERVICE_ROLE_KEY is not set");
  if (!result.mailConfigured) return done("ALERT_EMAIL_USER / ALERT_EMAIL_APP_PASSWORD are not set");

  const today = pacificDate(now);
  const day = (offset: number) => pacificLocalToUtc(`${addDaysToKey(today, offset)}T00:00`);
  const [yesterday, startOfToday, tomorrow, dayAfter] = [day(-1), day(0), day(1), day(2)];
  if (!yesterday || !startOfToday || !tomorrow || !dayAfter) return done("could not work out the day windows");

  const CAP = 250; // stays well inside a Gmail account's daily sending limit
  const capped = () => result.reminders + result.feedbackRequests >= CAP;

  /** Look someone up and email them; returns whether it was sent. Skips and failures are counted. */
  const emailPerson = async (userId: string, build: (r: Recipient) => Omit<Mail, "to">) => {
    const found = await recipient(admin, userId);
    if (!found.ok) {
      result.skipped[found.skip]++;
      return false;
    }
    const sent = await send({ to: found.to.email, ...build(found.to) });
    if (!sent.ok) {
      result.failed++;
      result.firstFailure ??= `${sent.reason}${sent.detail ? `: ${sent.detail}` : ""}`;
      return false;
    }
    return true;
  };

  // Reminders: tomorrow's meetups.
  const upcoming = await eventsBetween(admin, tomorrow, dayAfter);
  result.eventsTomorrow = upcoming.length;
  for (const event of upcoming) {
    let place = `${event.venue_name}, ${event.address}`;
    if (event.join_mode === "request") {
      // Everyone emailed here is the host or approved, so they're allowed to know.
      const { data: loc } = await admin.from("event_locations").select("venue_name, address").eq("event_id", event.id).maybeSingle();
      place = loc ? `${loc.venue_name}, ${loc.address}` : "See the meetup page for the address";
    }
    const when = formatWhenLong(event.starts_at);
    const ids = Array.from(new Set([event.host_id, ...(await approvedGuestIds(admin, event.id))]));

    for (const id of ids) {
      if (capped()) return done("stopped at the daily cap");
      const sent = await emailPerson(id, (r) =>
        email.reminder({
          name: r.name,
          eventTitle: event.title,
          when: `${when.day} at ${when.time}`,
          place,
          eventUrl: eventUrl(event.id),
          calendarUrl: `${eventUrl(event.id)}/calendar.ics`,
          siteUrl: SITE_URL,
        })
      );
      if (sent) result.reminders++;
    }
  }

  // Feedback requests: yesterday's meetups, to guests (the host doesn't rate their own).
  const past = await eventsBetween(admin, yesterday, startOfToday);
  result.eventsYesterday = past.length;
  for (const event of past) {
    const ids = (await approvedGuestIds(admin, event.id)).filter((id) => id !== event.host_id);
    for (const id of ids) {
      if (capped()) return done("stopped at the daily cap");
      const sent = await emailPerson(id, (r) =>
        email.feedbackRequest({ name: r.name, eventTitle: event.title, eventUrl: eventUrl(event.id), siteUrl: SITE_URL })
      );
      if (sent) result.feedbackRequests++;
    }
  }

  return done();
}
