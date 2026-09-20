import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as email from "./email-templates";
import { sendMail } from "./mailer";
import { SITE_URL } from "./site";
import { createAdminClient } from "./supabase/admin";
import { addDaysToKey, formatWhenLong, pacificDate, pacificLocalToUtc } from "./time";
import { firstName } from "./utils";

// Everything here is best effort and never throws: an email problem must not break the action
// that triggered it. With no service key or mail account configured, it all quietly does nothing.

const eventUrl = (id: string) => `${SITE_URL}/events/${id}`;

type Recipient = { email: string; name: string };

/** Someone's email address and first name, unless they've turned emails off. */
async function recipient(admin: SupabaseClient, userId: string): Promise<Recipient | null> {
  const [user, settings, profile] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("user_settings").select("email_notifications").eq("user_id", userId).maybeSingle(),
    admin.from("profiles").select("name").eq("id", userId).maybeSingle(),
  ]);
  const address = user.data?.user?.email;
  if (!address || settings.data?.email_notifications === false) return null;
  return { email: address, name: firstName(profile.data?.name) };
}

async function safely(label: string, work: () => Promise<void>) {
  try {
    await work();
  } catch (err) {
    console.error(`Notification failed (${label}):`, err);
  }
}

/** A person asked to join an approval-only meetup: tell the host. */
export function notifyHostOfRequest(eventId: string, requesterId: string) {
  return safely("request received", async () => {
    const admin = createAdminClient();
    if (!admin) return;
    const { data: event } = await admin.from("events").select("title, host_id, join_mode").eq("id", eventId).maybeSingle();
    if (!event || event.join_mode !== "request" || event.host_id === requesterId) return;

    const [host, requester] = await Promise.all([
      recipient(admin, event.host_id),
      admin.from("profiles").select("name").eq("id", requesterId).maybeSingle(),
    ]);
    if (!host) return;
    await sendMail({
      to: host.email,
      ...email.requestReceived({
        hostName: host.name,
        requesterName: firstName(requester.data?.name),
        eventTitle: event.title,
        eventUrl: eventUrl(eventId),
        siteUrl: SITE_URL,
      }),
    });
  });
}

/** The host approved or declined: tell the requester. */
export function notifyRequestDecision(eventId: string, userId: string, approved: boolean) {
  return safely("request decision", async () => {
    const admin = createAdminClient();
    if (!admin) return;
    const { data: event } = await admin.from("events").select("title").eq("id", eventId).maybeSingle();
    const to = await recipient(admin, userId);
    if (!event || !to) return;
    await sendMail({
      to: to.email,
      ...email.requestDecision({ name: to.name, eventTitle: event.title, approved, eventUrl: eventUrl(eventId), siteUrl: SITE_URL }),
    });
  });
}

/** The host cancelled: tell everyone who was approved to go. */
export function notifyEventCancelled(eventId: string) {
  return safely("event cancelled", async () => {
    const admin = createAdminClient();
    if (!admin) return;
    const { data: event } = await admin.from("events").select("title, starts_at, host_id").eq("id", eventId).maybeSingle();
    if (!event) return;
    const { data: guests } = await admin.from("rsvps").select("user_id").eq("event_id", eventId).eq("status", "approved");

    const when = formatWhenLong(event.starts_at);
    for (const g of (guests ?? []).filter((g) => g.user_id !== event.host_id).slice(0, 200)) {
      const to = await recipient(admin, g.user_id as string);
      if (!to) continue;
      await sendMail({
        to: to.email,
        ...email.eventCancelled({
          name: to.name,
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

/**
 * The once-a-day emails, all in Pacific time so each meetup falls into exactly one run:
 *   - reminders, to the host and approved guests of every meetup happening tomorrow
 *   - "how was it?", to the approved guests of every meetup that happened yesterday
 */
export async function sendDailyEmails(now = new Date()) {
  const admin = createAdminClient();
  if (!admin) return { reminders: 0, feedbackRequests: 0, note: "SUPABASE_SERVICE_ROLE_KEY is not set" };

  const today = pacificDate(now);
  const day = (offset: number) => pacificLocalToUtc(`${addDaysToKey(today, offset)}T00:00`);
  const [yesterday, tomorrow, dayAfter] = [day(-1), day(1), day(2)];
  const startOfToday = day(0);
  if (!yesterday || !startOfToday || !tomorrow || !dayAfter) {
    return { reminders: 0, feedbackRequests: 0, note: "could not work out the day windows" };
  }

  let reminders = 0;
  let feedbackRequests = 0;
  const CAP = 250; // stays well inside a Gmail account's daily sending limit
  const capped = () => reminders + feedbackRequests >= CAP;

  // Reminders: tomorrow's meetups.
  for (const event of await eventsBetween(admin, tomorrow, dayAfter)) {
    let place = `${event.venue_name}, ${event.address}`;
    if (event.join_mode === "request") {
      // Everyone emailed here is the host or approved, so they're allowed to know.
      const { data: loc } = await admin.from("event_locations").select("venue_name, address").eq("event_id", event.id).maybeSingle();
      place = loc ? `${loc.venue_name}, ${loc.address}` : "See the meetup page for the address";
    }
    const when = formatWhenLong(event.starts_at);
    const ids = Array.from(new Set([event.host_id, ...(await approvedGuestIds(admin, event.id))]));

    for (const id of ids) {
      if (capped()) return { reminders, feedbackRequests, note: "stopped at the daily cap" };
      const r = await recipient(admin, id);
      if (!r) continue;
      const ok = await sendMail({
        to: r.email,
        ...email.reminder({
          name: r.name,
          eventTitle: event.title,
          when: `${when.day} at ${when.time}`,
          place,
          eventUrl: eventUrl(event.id),
          calendarUrl: `${eventUrl(event.id)}/calendar.ics`,
          siteUrl: SITE_URL,
        }),
      });
      if (ok) reminders++;
    }
  }

  // Feedback requests: yesterday's meetups, to guests (the host doesn't rate their own).
  for (const event of await eventsBetween(admin, yesterday, startOfToday)) {
    const ids = (await approvedGuestIds(admin, event.id)).filter((id) => id !== event.host_id);
    for (const id of ids) {
      if (capped()) return { reminders, feedbackRequests, note: "stopped at the daily cap" };
      const r = await recipient(admin, id);
      if (!r) continue;
      const ok = await sendMail({
        to: r.email,
        ...email.feedbackRequest({ name: r.name, eventTitle: event.title, eventUrl: eventUrl(event.id), siteUrl: SITE_URL }),
      });
      if (ok) feedbackRequests++;
    }
  }

  return { reminders, feedbackRequests };
}
