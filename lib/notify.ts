import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as email from "./email-templates";
import { mailConfigured, sendMail, type Mail, type MailResult } from "./mailer";
import { pushConfigured, sendPushToUser, type PushOutcome, type PushPayload } from "./push";
import { pushSummary, type DetailChange } from "./event-edit";
import { metCount, whyThis, type Taste } from "./engagement";
import { claimSend, digestSentRecently, underNudgeCap } from "./notify-log";
import { channelsFor, parsePrefs, type Category, type Prefs } from "./notify-policy";
import { cityOfEvent, cityOfUser, loadPool, picksFor } from "./picks";
import { SITE_URL } from "./site";
import { createAdminClient } from "./supabase/admin";
import { addDaysToKey, formatWhenLong, formatWhenShort, pacificDate, pacificLocalToUtc, pacificWeekday } from "./time";
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
type Lookup = { ok: true; to: Recipient; prefs: Prefs } | { ok: false; skip: Skip; prefs: Prefs };

/** Someone's notification settings. Before migration 019 only the email switch exists; that still works. */
export async function loadPrefs(admin: SupabaseClient, userId: string): Promise<Prefs> {
  let res = await admin
    .from("user_settings")
    .select("email_notifications, notify_reminders, notify_matches, notify_activity, quiet_start, quiet_end")
    .eq("user_id", userId)
    .maybeSingle();
  if (res.error) res = await admin.from("user_settings").select("email_notifications").eq("user_id", userId).maybeSingle();
  return parsePrefs(res.data as Record<string, unknown> | null);
}

/** Someone's email address and first name, and their settings, unless they've turned emails off. */
async function recipient(admin: SupabaseClient, userId: string, known?: Prefs): Promise<Lookup> {
  const [user, prefs, profile] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    known ? Promise.resolve(known) : loadPrefs(admin, userId),
    admin.from("profiles").select("name").eq("id", userId).maybeSingle(),
  ]);
  if (user.error) {
    console.error("Email lookup failed for a recipient:", user.error.message);
    return { ok: false, skip: "lookupFailed", prefs };
  }
  const address = user.data?.user?.email;
  if (!address) return { ok: false, skip: "noEmail", prefs };
  if (!prefs.email) return { ok: false, skip: "optedOut", prefs };
  return { ok: true, to: { email: address, name: firstName(profile.data?.name) }, prefs };
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
    const via = channelsFor(host.prefs, "activity", deps.now ?? new Date());
    if (host.ok && via.email) {
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
    if (via.push) {
      await push(event.host_id, {
        title: `${requesterName} wants to join`,
        body: event.title,
        url: `/events/${eventId}`,
        tag: `request-${eventId}`,
      });
    }
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
 * A spot opened at a full meetup: tell the people waiting, oldest first (up to five, since only a
 * spot or two opened). They asked to be told, so this is critical news: their quiet hours don't
 * hold it back. First come, first served: nobody is added automatically.
 */
export function notifySpotOpened(eventId: string, deps: Deps = {}) {
  return safely("spot opened", async () => {
    const { admin, send, push } = use(deps);
    if (!admin) return;
    const now = deps.now ?? new Date();
    const { data: event } = await admin.from("events").select("title, starts_at, max_spots, spots_taken, cancelled_at, join_mode").eq("id", eventId).maybeSingle();
    if (!event || event.cancelled_at || event.join_mode !== "open" || new Date(event.starts_at as string) <= now) return;
    const free = (event.max_spots as number) - (event.spots_taken as number);
    if (free <= 0) return;
    const { data: waiting } = await admin.from("event_waitlist").select("user_id").eq("event_id", eventId).order("created_at", { ascending: true }).limit(5);
    for (const w of waiting ?? []) {
      const id = w.user_id as string;
      // One message per person per ten minutes, so a burst of changes doesn't repeat itself.
      if (!(await claimSend(admin, id, "spot_opened", `${eventId}:${Math.floor(now.getTime() / 600000)}`))) continue;
      const to = await recipient(admin, id);
      const via = channelsFor(to.prefs, "critical", now);
      if (to.ok && via.email) {
        await send({ to: to.to.email, ...email.spotOpened({ name: to.to.name, eventTitle: event.title as string, when: formatWhenShort(event.starts_at as string), eventUrl: eventUrl(eventId), siteUrl: SITE_URL }) });
      }
      if (via.push) await push(id, { title: `A spot opened up: ${event.title}`, body: "First come, first served. Tap to take it.", url: `/events/${eventId}`, tag: `spot-${eventId}` });
    }
  });
}

/** A guest freed their spot close to the start (within 48 hours): tell the host, who may want to fill it. */
export function notifyHostOfDrop(eventId: string, guestId: string, deps: Deps = {}) {
  return safely("guest dropped", async () => {
    const { admin, send, push } = use(deps);
    if (!admin) return;
    const now = deps.now ?? new Date();
    const { data: event } = await admin.from("events").select("title, starts_at, host_id, max_spots, spots_taken, cancelled_at").eq("id", eventId).maybeSingle();
    if (!event || event.cancelled_at || event.host_id === guestId) return;
    const hoursAway = (new Date(event.starts_at as string).getTime() - now.getTime()) / 3600000;
    if (hoursAway <= 0 || hoursAway > 48) return;
    if (!(await claimSend(admin, event.host_id as string, "host_drop", `${eventId}:${guestId}`))) return;

    const [host, guest] = await Promise.all([recipient(admin, event.host_id as string), admin.from("profiles").select("name").eq("id", guestId).maybeSingle()]);
    const guestName = firstName(guest.data?.name);
    const via = channelsFor(host.prefs, "activity", now);
    const spotsLeft = Math.max((event.max_spots as number) - (event.spots_taken as number), 0);
    if (host.ok && via.email) {
      await send({ to: host.to.email, ...email.guestDropped({ name: host.to.name, guestName, eventTitle: event.title as string, when: formatWhenShort(event.starts_at as string), spotsLeft, eventUrl: eventUrl(eventId), siteUrl: SITE_URL }) });
    }
    if (via.push && (await underNudgeCap(admin, event.host_id as string, now))) {
      await push(event.host_id as string, { title: `${guestName} can't make it`, body: `${event.title}: ${spotsLeft} ${spotsLeft === 1 ? "spot" : "spots"} open.`, url: `/events/${eventId}`, tag: `drop-${eventId}` });
    }
  });
}

/**
 * Someone came along because a friend invited them: tell the friend. Only for an approved guest
 * (so for approval-only meetups it waits for the host's yes), once per friend and meetup, as a
 * nudge (limited per person, quiet hours respected).
 */
export function notifyFriendJoined(eventId: string, friendId: string, deps: Deps = {}) {
  return safely("friend joined", async () => {
    const { admin, send, push } = use(deps);
    if (!admin) return;
    const now = deps.now ?? new Date();
    const { data: rsvp } = await admin.from("rsvps").select("status, invited_by").eq("event_id", eventId).eq("user_id", friendId).maybeSingle();
    const inviterId = rsvp?.invited_by as string | null | undefined;
    if (!rsvp || rsvp.status !== "approved" || !inviterId || inviterId === friendId) return;
    const { data: event } = await admin.from("events").select("title, starts_at, cancelled_at").eq("id", eventId).maybeSingle();
    if (!event || event.cancelled_at || new Date(event.starts_at as string) <= now) return;
    if (!(await claimSend(admin, inviterId, "friend_joined", `${eventId}:${friendId}`))) return;

    const [to, friend] = await Promise.all([recipient(admin, inviterId), admin.from("profiles").select("name").eq("id", friendId).maybeSingle()]);
    const friendName = firstName(friend.data?.name);
    const via = channelsFor(to.prefs, "activity", now);
    if (to.ok && via.email) {
      await send({
        to: to.to.email,
        ...email.friendJoined({
          name: to.to.name,
          friendName,
          eventTitle: event.title as string,
          when: formatWhenShort(event.starts_at as string),
          eventUrl: eventUrl(eventId),
          siteUrl: SITE_URL,
        }),
      });
    }
    if (via.push && (await underNudgeCap(admin, inviterId, now))) {
      await push(inviterId, { title: `${friendName} is coming!`, body: `They joined ${event.title} because you invited them.`, url: `/events/${eventId}`, tag: `friend-${eventId}` });
    }
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
  category?: string;
  neighborhood?: string;
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
    .select("id, title, starts_at, host_id, join_mode, venue_name, address, category, neighborhood")
    .is("cancelled_at", null)
    .gte("starts_at", from.toISOString())
    .lt("starts_at", to.toISOString());
  return (data ?? []) as EventRow[];
}

async function approvedGuestIds(admin: SupabaseClient, eventId: string): Promise<string[]> {
  const { data } = await admin.from("rsvps").select("user_id").eq("event_id", eventId).eq("status", "approved");
  return (data ?? []).map((g) => g.user_id as string);
}

/** The weekly digest goes out on this day (Pacific time; 4 = Thursday), for meetups in the next 10 days. */
const DIGEST_WEEKDAY = 4;
const DIGEST_WINDOW_DAYS = 10;
const DIGEST_ITEMS = 4;

export type DailyResult = {
  reminders: number;
  feedbackRequests: number;
  /** Weekly "meetups you might like" notes sent (email or push). */
  digests: number;
  /** Day-of "Still coming?" prompts sent. */
  stillComing: number;
  /** "How it went" wrap-ups sent to hosts. */
  hostRecaps: number;
  eventsTomorrow: number;
  eventsYesterday: number;
  /** People who would have been emailed but weren't, and why. */
  skipped: Record<Skip, number>;
  /** Emails and pushes held back because the person switched that kind off, or it was their quiet hours. */
  mutedByPrefs: number;
  pushMuted: number;
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
    digests: 0,
    stillComing: 0,
    hostRecaps: 0,
    eventsTomorrow: 0,
    eventsYesterday: 0,
    skipped: { noEmail: 0, optedOut: 0, lookupFailed: 0 },
    mutedByPrefs: 0,
    pushMuted: 0,
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

  const prefsCache = new Map<string, Prefs>();
  const prefsOf = async (userId: string) => {
    if (!prefsCache.has(userId)) prefsCache.set(userId, await loadPrefs(admin, userId));
    return prefsCache.get(userId)!;
  };

  const CAP = 250; // stays well inside a Gmail account's daily sending limit
  const capped = () => result.reminders + result.feedbackRequests + result.digests + result.stillComing + result.hostRecaps >= CAP;

  /** Look someone up and email them; returns whether it was sent. Skips and failures are counted. */
  const emailPerson = async (userId: string, build: (r: Recipient) => Omit<Mail, "to">, category: Category = "reminders") => {
    if (!result.mailConfigured) return false; // email is off; push may still go out
    const found = await recipient(admin, userId, await prefsOf(userId));
    if (!found.ok) {
      result.skipped[found.skip]++;
      return false;
    }
    if (!channelsFor(found.prefs, category, now).email) {
      result.mutedByPrefs++; // they've switched this kind off
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
  const pushPerson = async (userId: string, payload: PushPayload, category: Category = "reminders") => {
    if (!result.pushConfigured) return;
    if (!channelsFor(await prefsOf(userId), category, now).push) {
      result.pushMuted++; // switched off, or inside their quiet hours
      return;
    }
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

  // Feedback requests: yesterday's meetups, to guests (the host doesn't rate their own). Each carries
  // a warm recap (how many people they met) and a few similar meetups coming up, while the good
  // feeling is fresh.
  const past = await eventsBetween(admin, yesterday, startOfToday);
  result.eventsYesterday = past.length;
  // One pool of upcoming meetups per city (just one in a one-city app), loaded when first needed.
  const similarPools = new Map<string, Awaited<ReturnType<typeof loadPool>>>();
  const similarPoolFor = async (city: string) => {
    if (!similarPools.has(city)) similarPools.set(city, await loadPool(admin, now, 14, 300, city));
    return similarPools.get(city)!;
  };
  for (const event of past) {
    const eventCity = await cityOfEvent(admin, event.id);
    const approved = await approvedGuestIds(admin, event.id);
    const ids = approved.filter((id) => id !== event.host_id);
    for (const id of ids) {
      if (capped()) return done("stopped at the daily cap");
      const met = metCount(approved, id, event.host_id);
      // Similar meetups: the same kind of thing, near the same place (best effort: never blocks the message).
      let similar: Awaited<ReturnType<typeof picksFor>> = [];
      try {
        const taste: Taste = { categories: event.category ? [event.category] : [], neighborhoods: event.neighborhood ? [event.neighborhood] : [] };
        similar = await picksFor(admin, id, await similarPoolFor(eventCity), taste, { now, withinDays: 14, limit: 3 });
      } catch (err) {
        console.error("Couldn't pick similar meetups for the recap:", err);
      }
      const sent = await emailPerson(id, (r) =>
        email.feedbackRequest({
          name: r.name,
          eventTitle: event.title,
          eventUrl: eventUrl(event.id),
          siteUrl: SITE_URL,
          metCount: met,
          similar: similar.map((c) => ({ title: c.title, when: formatWhenShort(c.starts_at), place: c.neighborhood, url: eventUrl(c.id) })),
        })
      );
      if (sent) result.feedbackRequests++;
      await pushPerson(id, {
        title: `How was ${event.title}?`,
        body: met > 0 ? `You met ${met} ${met === 1 ? "person" : "people"}. Tap to answer in one tap.` : "Tap to answer in one tap.",
        url: `/events/${event.id}`,
        tag: `feedback-${event.id}`,
      });
    }
  }

  // Host recap: the morning after, each host of a meetup that just happened hears how it went (how many
  // came, how many had been before) and is nudged to post the next one. Once per meetup, as a nudge.
  for (const event of past) {
    if (capped()) return done("stopped at the daily cap");
    const guests = (await approvedGuestIds(admin, event.id)).filter((id) => id !== event.host_id);
    if (guests.length === 0) continue;
    const { data: earlier } = await admin.from("events").select("id").eq("host_id", event.host_id).lt("starts_at", event.starts_at).is("cancelled_at", null);
    const earlierIds = (earlier ?? []).map((e) => e.id as string);
    let cameBack = 0;
    if (earlierIds.length > 0) {
      const { data: before } = await admin.from("rsvps").select("user_id").eq("status", "approved").in("event_id", earlierIds).in("user_id", guests);
      cameBack = new Set((before ?? []).map((r) => r.user_id as string)).size;
    }
    const prefs = await prefsOf(event.host_id);
    if (!prefs.activity) {
      result.mutedByPrefs++;
      continue;
    }
    if (!(await claimSend(admin, event.host_id, "host_recap", event.id))) continue;
    await emailPerson(
      event.host_id,
      (r) => email.hostRecap({ name: r.name, eventTitle: event.title, came: guests.length, cameBack, nextUrl: `${SITE_URL}/events/new?from=${event.id}`, eventUrl: eventUrl(event.id), siteUrl: SITE_URL }),
      "activity"
    );
    if (await underNudgeCap(admin, event.host_id, now)) {
      await pushPerson(
        event.host_id,
        { title: `${guests.length} ${guests.length === 1 ? "person" : "people"} came to ${event.title}`, body: cameBack > 0 ? `${cameBack} had been before. Tap to post the next one.` : "Tap to post the next one.", url: `/events/new?from=${event.id}`, tag: `recap-${event.id}` },
        "activity"
      );
    }
    result.hostRecaps++;
  }

  // "Still coming?" the day of: approved guests of today's meetups that start at least two hours from
  // now, who haven't confirmed yet. If they can't come, freeing the spot lets the waitlist have it.
  const soonest = new Date(Math.max(now.getTime() + 2 * 3600000, startOfToday.getTime()));
  if (soonest < tomorrow) {
    for (const event of await eventsBetween(admin, soonest, tomorrow)) {
      const { data: going, error: goingError } = await admin.from("rsvps").select("user_id, confirmed_at").eq("event_id", event.id).eq("status", "approved");
      if (goingError) continue; // the database update (migration 019) hasn't been run: skip rather than guess
      const when = formatWhenLong(event.starts_at);
      for (const g of going ?? []) {
        const id = g.user_id as string;
        if (id === event.host_id || g.confirmed_at) continue;
        if (capped()) return done("stopped at the daily cap");
        const prefs = await prefsOf(id);
        if (!prefs.reminders) {
          result.mutedByPrefs++;
          continue;
        }
        if (!(await claimSend(admin, id, "still_coming", event.id))) continue;
        await emailPerson(id, (r) => email.stillComing({ name: r.name, eventTitle: event.title, when: when.time, eventUrl: eventUrl(event.id), siteUrl: SITE_URL }), "reminders");
        if (await underNudgeCap(admin, id, now)) {
          await pushPerson(id, { title: `Still coming to ${event.title}?`, body: `Starts ${when.time}. Tap to confirm, or free your spot.`, url: `/events/${event.id}`, tag: `still-${event.id}` }, "reminders");
        }
        result.stillComing++;
      }
    }
  }

  // Weekly digest (Thursdays): a few meetups that match what someone likes. Only to people who picked
  // interests, only when there is something worth sending, and never twice in a week.
  if (pacificWeekday(now) === DIGEST_WEEKDAY) {
    const horizon = new Date(now.getTime() + DIGEST_WINDOW_DAYS * 86400000);
    // Each person's digest comes from their own city; one pool per city, loaded when first needed.
    const digestPools = new Map<string, Awaited<ReturnType<typeof loadPool>>>();
    const digestPoolFor = async (city: string) => {
      if (!digestPools.has(city)) digestPools.set(city, await loadPool(admin, now, DIGEST_WINDOW_DAYS, 300, city));
      return digestPools.get(city)!;
    };
    {
      const { data: members } = await admin.from("user_interests").select("user_id, categories").limit(1000);
      for (const m of members ?? []) {
        const categories = (m.categories as string[] | null) ?? [];
        if (categories.length === 0) continue;
        const id = m.user_id as string;
        const pool = await digestPoolFor(await cityOfUser(admin, id));
        if (pool.length === 0) continue; // nothing coming up in their city: nothing to look up or send
        if (capped()) return done("stopped at the daily cap");
        const prefs = await prefsOf(id);
        if (!prefs.matches) {
          result.mutedByPrefs++;
          continue;
        }
        if (await digestSentRecently(admin, id, now)) continue;

        const taste: Taste = { categories, neighborhoods: [] };
        const picks = await picksFor(admin, id, pool, taste, { now, withinDays: DIGEST_WINDOW_DAYS, limit: DIGEST_ITEMS });
        if (picks.length === 0) continue; // nothing worth sending: send nothing

        if (!(await claimSend(admin, id, "digest", today))) continue;
        await emailPerson(
          id,
          (r) =>
            email.weeklyDigest({
              name: r.name,
              siteUrl: SITE_URL,
              items: picks.map((c) => ({ title: c.title, when: formatWhenShort(c.starts_at), place: c.neighborhood, spotsLeft: c.spots_left, why: whyThis(c, taste), url: eventUrl(c.id) })),
            }),
          "matches"
        );
        if (await underNudgeCap(admin, id, now)) {
          await pushPerson(
            id,
            {
              title: `${picks.length} ${picks.length === 1 ? "meetup" : "meetups"} you might like`,
              body: `${picks[0].title}, ${formatWhenShort(picks[0].starts_at)}${picks.length > 1 ? ` and ${picks.length - 1} more` : ""}`,
              url: "/",
              tag: `digest-${today}`,
            },
            "matches"
          );
        }
        result.digests++;
      }
    }
  }

  return done();
}
