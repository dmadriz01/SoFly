import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as email from "./email-templates";
import { mailConfigured, sendMail, type Mail, type MailResult } from "./mailer";
import { pushConfigured, sendPushToUser, type PushOutcome, type PushPayload } from "./push";
import { pushSummary, type DetailChange } from "./event-edit";
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
  push?: (userId: string, payload: PushPayload) => Promise<PushOutcome>;
  /** Tests can force either channel on or off; otherwise it follows the real configuration. */
  mailConfigured?: boolean;
  pushConfigured?: boolean;
  /** Tests can fix "now"; production always uses the real time. */
  now?: Date;
};

const use = (deps: Deps) => {
  const admin = deps.admin === undefined ? createAdminClient() : deps.admin;
  return {
    admin,
    send: deps.send ?? sendMail,
    // Push has its own consent (a person turns it on per device), so it ignores the email switch.
    push:
      deps.push ??
      (async (userId: string, payload: PushPayload): Promise<PushOutcome> =>
        admin ? sendPushToUser(admin, userId, payload) : { sent: 0, removed: 0, failed: 0 }),
  };
};

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
    const { admin, send, push } = use(deps);
    if (!admin) return;
    const { data: event } = await admin.from("events").select("title, host_id, join_mode").eq("id", eventId).maybeSingle();
    if (!event || event.join_mode !== "request" || event.host_id === requesterId) return;

    const [host, requester] = await Promise.all([
      recipient(admin, event.host_id),
      admin.from("profiles").select("name").eq("id", requesterId).maybeSingle(),
    ]);
    const requesterName = firstName(requester.data?.name);
    if (host.ok) {
      await send({
        to: host.to.email,
        ...email.requestReceived({
          hostName: host.to.name,
          requesterName,
          eventTitle: event.title,
          eventUrl: eventUrl(eventId),
          siteUrl: SITE_URL,
        }),
      });
    }
    await push(event.host_id, {
      title: `${requesterName} wants to join`,
      body: event.title,
      url: `/events/${eventId}`,
      tag: `request-${eventId}`,
    });
  });
}

/** The host approved or declined: tell the requester. */
export function notifyRequestDecision(eventId: string, userId: string, approved: boolean, deps: Deps = {}) {
  return safely("request decision", async () => {
    const { admin, send, push } = use(deps);
    if (!admin) return;
    const { data: event } = await admin.from("events").select("title").eq("id", eventId).maybeSingle();
    if (!event) return;
    const to = await recipient(admin, userId);
    if (to.ok) {
      await send({
        to: to.to.email,
        ...email.requestDecision({ name: to.to.name, eventTitle: event.title, approved, eventUrl: eventUrl(eventId), siteUrl: SITE_URL }),
      });
    }
    await push(userId, {
      title: approved ? "You're in!" : `An update on ${event.title}`,
      body: approved ? `${event.title}. Tap for the address and details.` : "The host couldn't fit you in this time.",
      url: `/events/${eventId}`,
      tag: `decision-${eventId}`,
    });
  });
}

/** A meetup that was called off, and the people who should hear about it. */
export type Cancellation = {
  eventId: string;
  title: string;
  startsAt: string;
  hostId: string;
  /** Approved guests other than the host. */
  guestIds: string[];
  /** Who called it off: the host, or SoFly (a moderator). */
  by: "host" | "moderator";
  /** True when the meetup page no longer exists (the host deleted it), so tapping goes to the feed. */
  removed: boolean;
};

/**
 * Works out who to tell that a meetup is off. Returns null when nobody should be told: the meetup
 * doesn't exist, it has already started or happened (a "cancelled" notice about the past would only
 * confuse people), or nobody but the host was going. With `requireActive` it also stays quiet for a
 * meetup that was already cancelled, whose guests were told at the time.
 */
async function loadCancellation(
  admin: SupabaseClient,
  eventId: string,
  opts: { by: Cancellation["by"]; removed: boolean; requireActive: boolean; now: Date }
): Promise<Cancellation | null> {
  const { data: event } = await admin
    .from("events")
    .select("title, starts_at, host_id, cancelled_at")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return null;
  if (opts.requireActive && event.cancelled_at) return null;
  if (new Date(event.starts_at as string) <= opts.now) return null;

  const { data: guests } = await admin.from("rsvps").select("user_id").eq("event_id", eventId).eq("status", "approved");
  const guestIds = (guests ?? [])
    .map((g) => g.user_id as string)
    .filter((id) => id !== event.host_id)
    .slice(0, 200);
  if (guestIds.length === 0) return null;
  return { eventId, title: event.title as string, startsAt: event.starts_at as string, hostId: event.host_id as string, guestIds, by: opts.by, removed: opts.removed };
}

/** Email and push, to each guest. Each channel follows that person's own settings. */
async function deliverCancellation(c: Cancellation, admin: SupabaseClient, deps: Deps) {
  const { send, push } = use({ ...deps, admin });
  const when = formatWhenLong(c.startsAt);
  for (const userId of c.guestIds) {
    const to = await recipient(admin, userId);
    if (to.ok) {
      await send({
        to: to.to.email,
        ...email.eventCancelled({
          name: to.to.name,
          eventTitle: c.title,
          when: `${when.day} at ${when.time}`,
          eventUrl: eventUrl(c.eventId),
          siteUrl: SITE_URL,
          by: c.by,
        }),
      });
    }
    await push(userId, {
      title: `Cancelled: ${c.title}`,
      body: c.by === "moderator" ? "SoFly cancelled this meetup." : "The host cancelled this meetup.",
      url: c.removed ? "/" : `/events/${c.eventId}`,
      tag: `cancelled-${c.eventId}`,
    });
  }
}

/**
 * A meetup was just cancelled (it stays on its page, marked cancelled): tell everyone who was
 * going. Call it after the cancellation went through. `by` says who cancelled.
 */
export function notifyEventCancelled(eventId: string, deps: Deps = {}, by: Cancellation["by"] = "host") {
  return safely("event cancelled", async () => {
    const { admin } = use(deps);
    if (!admin) return;
    // Already marked cancelled by the time this runs, so don't ask for an "active" meetup here.
    const c = await loadCancellation(admin, eventId, { by, removed: false, requireActive: false, now: deps.now ?? new Date() });
    if (c) await deliverCancellation(c, admin, deps);
  });
}

/**
 * Deleting a meetup removes its guest list, so who to tell has to be looked up BEFORE the delete.
 * Returns null when nobody should be told (or the service key isn't set). Send the result with
 * notifyEventDeleted, and only if the delete really happened.
 */
export async function snapshotBeforeDelete(eventId: string, deps: Deps = {}): Promise<Cancellation | null> {
  try {
    const { admin } = use(deps);
    if (!admin) return null;
    return await loadCancellation(admin, eventId, { by: "host", removed: true, requireActive: true, now: deps.now ?? new Date() });
  } catch (err) {
    console.error("Notification failed (looking up guests before delete):", err);
    return null;
  }
}

/** The host deleted the meetup: tell the people who were going (from the snapshot taken before). */
export function notifyEventDeleted(snapshot: Cancellation, deps: Deps = {}) {
  return safely("event deleted", async () => {
    const { admin } = use(deps);
    if (!admin) return;
    await deliverCancellation(snapshot, admin, deps);
  });
}

/**
 * The host changed a meetup's time or place: tell everyone who was going, by email and push. The push
 * says what kind of thing changed but never the address itself (it would show on a lock screen).
 * Quiet for a meetup that already started or was cancelled, and if nothing actually changed.
 */
export function notifyEventUpdated(eventId: string, changes: DetailChange[], deps: Deps = {}) {
  return safely("event updated", async () => {
    if (changes.length === 0) return;
    const { admin, send, push } = use(deps);
    if (!admin) return;
    const { data: event } = await admin.from("events").select("title, starts_at, host_id, cancelled_at").eq("id", eventId).maybeSingle();
    if (!event || event.cancelled_at || new Date(event.starts_at as string) <= (deps.now ?? new Date())) return;
    const { data: guests } = await admin.from("rsvps").select("user_id").eq("event_id", eventId).eq("status", "approved");

    const when = formatWhenLong(event.starts_at as string);
    for (const g of (guests ?? []).filter((g) => g.user_id !== event.host_id).slice(0, 200)) {
      const to = await recipient(admin, g.user_id as string);
      if (to.ok) {
        await send({
          to: to.to.email,
          ...email.eventUpdated({
            name: to.to.name,
            eventTitle: event.title as string,
            changes,
            when: `${when.day} at ${when.time}`,
            eventUrl: eventUrl(eventId),
            siteUrl: SITE_URL,
          }),
        });
      }
      await push(g.user_id as string, {
        title: `Updated: ${event.title}`,
        body: pushSummary(changes),
        url: `/events/${eventId}`,
        tag: `updated-${eventId}`,
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
  /** Push notifications delivered to a device, and refused by a push service. */
  pushes: number;
  pushFailed: number;
  pushConfigured: boolean;
  note?: string;
};

/**
 * The once-a-day emails, all in Pacific time so each meetup falls into exactly one run:
 *   - reminders, to the host and approved guests of every meetup happening tomorrow
 *   - "how was it?", to the approved guests of every meetup that happened yesterday
 * The result says exactly what happened and why anyone was skipped, and is logged.
 */
export async function sendDailyEmails(now = new Date(), deps: Deps = {}): Promise<DailyResult> {
  const { admin, send, push } = use(deps);
  const result: DailyResult = {
    reminders: 0,
    feedbackRequests: 0,
    eventsTomorrow: 0,
    eventsYesterday: 0,
    skipped: { noEmail: 0, optedOut: 0, lookupFailed: 0 },
    failed: 0,
    mailConfigured: deps.mailConfigured ?? (deps.send ? true : mailConfigured()),
    pushes: 0,
    pushFailed: 0,
    pushConfigured: deps.pushConfigured ?? (deps.push ? true : pushConfigured()),
  };
  const done = (note?: string) => {
    if (note) result.note = note;
    console.log("Daily emails:", JSON.stringify(result));
    return result;
  };

  if (!admin) return done("SUPABASE_SERVICE_ROLE_KEY is not set");
  if (!result.mailConfigured && !result.pushConfigured) {
    return done("Neither email (ALERT_EMAIL_*) nor push (VAPID keys) is set up");
  }

  const today = pacificDate(now);
  const day = (offset: number) => pacificLocalToUtc(`${addDaysToKey(today, offset)}T00:00`);
  const [yesterday, startOfToday, tomorrow, dayAfter] = [day(-1), day(0), day(1), day(2)];
  if (!yesterday || !startOfToday || !tomorrow || !dayAfter) return done("could not work out the day windows");

  const CAP = 250; // stays well inside a Gmail account's daily sending limit
  const capped = () => result.reminders + result.feedbackRequests >= CAP;

  /** Look someone up and email them; returns whether it was sent. Skips and failures are counted. */
  const emailPerson = async (userId: string, build: (r: Recipient) => Omit<Mail, "to">) => {
    if (!result.mailConfigured) return false; // email is off; push may still go out
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

  /** A push notification to everyone's devices; counted separately from email. */
  const pushPerson = async (userId: string, payload: PushPayload) => {
    if (!result.pushConfigured) return;
    const o = await push(userId, payload);
    result.pushes += o.sent;
    result.pushFailed += o.failed;
    if (o.firstFailure) result.firstFailure ??= `push: ${o.firstFailure}`;
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
      await pushPerson(id, {
        title: `Tomorrow: ${event.title}`,
        body: `${when.time} at ${event.join_mode === "request" ? place.split(",")[0] : event.venue_name}`,
        url: `/events/${event.id}`,
        tag: `reminder-${event.id}`,
      });
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
      await pushPerson(id, {
        title: `How was ${event.title}?`,
        body: "Tap to answer in one tap.",
        url: `/events/${event.id}`,
        tag: `feedback-${event.id}`,
      });
    }
  }

  return done();
}
