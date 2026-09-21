"use server";

import { waitUntil } from "@vercel/functions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateOrInsert } from "@/lib/supabase/save";
import { sendReportAlert } from "@/lib/alerts";
import { diagnoseEmail, diagnosePush, type Check } from "@/lib/diagnose";
import { parseChatUrl } from "@/lib/chat";
import { parseAbout, type AboutErrors, type AboutInput } from "@/lib/about";
import { MIN_AGE, ageOn, parseBirthDate, resolveAgeRange } from "@/lib/age";
import { HIDDEN_VENUE, REPORT_REASONS, isCategory } from "@/lib/constants";
import {
  notifyEventCancelled,
  notifyEventDeleted,
  notifyHostOfRequest,
  notifyRequestDecision,
  snapshotBeforeDelete,
} from "@/lib/notify";
import { getBirthDate } from "@/lib/profile";
import { isPushEndpoint, pushConfigured } from "@/lib/push";
import { pacificDate, pacificLocalToUtc } from "@/lib/time";
import { safeNext } from "@/lib/utils";
import {
  EVENT_FIELDS,
  validateEvent,
  validateMaxSpots,
  validateRequestNote,
  type EventErrors,
} from "@/lib/validation";

export type CreateEventResult = { errors: EventErrors; formError?: string };

export async function createEvent(formData: FormData): Promise<CreateEventResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/events/new");
  if (!(await getBirthDate(supabase, user.id))) redirect("/welcome?next=/events/new");

  const input: Record<string, string> = {};
  for (const field of EVENT_FIELDS) {
    const value = formData.get(field);
    input[field] = typeof value === "string" ? value.trim() : "";
  }

  const errors = validateEvent(input);
  if (Object.keys(errors).length > 0) return { errors };

  const ageRange = resolveAgeRange(input.age_min, input.age_max);
  // Request-to-join events keep the real venue and address private (see event_locations).
  const isRequest = input.join_mode === "request";

  const { data, error } = await supabase
    .from("events")
    .insert({
      host_id: user.id,
      title: input.title,
      category: input.category,
      neighborhood: input.neighborhood,
      venue_name: isRequest ? HIDDEN_VENUE : input.venue_name,
      address: isRequest ? input.neighborhood : input.address,
      join_mode: input.join_mode,
      starts_at: pacificLocalToUtc(input.starts_at)!.toISOString(),
      max_spots: Number(input.max_spots),
      description: input.description,
      skill_level: input.skill_level,
      audience: input.audience,
      age_min: ageRange.min,
      age_max: ageRange.max,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { errors: {}, formError: "Something went wrong posting your meetup. Please try again." };
  }

  if (isRequest) {
    const { error: locationError } = await supabase
      .from("event_locations")
      .insert({ event_id: data.id, venue_name: input.venue_name, address: input.address });
    if (locationError) {
      // Without the private location the event would be useless, so undo it.
      await supabase.from("events").delete().eq("id", data.id);
      return { errors: {}, formError: "Something went wrong posting your meetup. Please try again." };
    }
  }

  // Optional. If this fails the event still exists; the host can add the link from its page.
  const chat = input.chat_url ? parseChatUrl(input.chat_url) : null;
  if (chat && "url" in chat) {
    await supabase.from("event_chat_links").insert({ event_id: data.id, url: chat.url });
  }

  revalidatePath("/");
  revalidatePath("/me");
  redirect(`/events/${data.id}`);
}

export async function setRsvp(
  eventId: string,
  join: boolean,
  note = ""
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in to join." };

  if (join) {
    // On approval-only events a person can add a note for the host (the host sees their profile too).
    const { data: event } = await supabase
      .from("events")
      .select("join_mode, host_id")
      .eq("id", eventId)
      .maybeSingle();
    const isRequest = event?.join_mode === "request" && event.host_id !== user.id;
    const cleanNote = note.trim();
    if (isRequest && cleanNote) {
      const noteError = validateRequestNote(cleanNote);
      if (noteError) return { error: noteError };
    }

    const { error } = await supabase
      .from("rsvps")
      .insert({ event_id: eventId, user_id: user.id });
    // 23505 = already joined or requested; nothing more to do.
    if (error?.code === "23505") return {};
    if (error) {
      return {
        error: error.message.includes("cancelled")
          ? "This meetup was cancelled."
          : error.message.includes("birthday")
            ? "Finish your profile first: we need your birthday to join meetups."
            : error.message.includes("age requirement")
              ? "This meetup has an age requirement you don't meet."
              : error.message.includes("full")
                ? "Sorry, this event just filled up."
                : "Couldn't join. Please try again.",
      };
    }

    if (isRequest) {
      if (cleanNote) {
        const { error: noteInsertError } = await supabase
          .from("rsvp_notes")
          .insert({ event_id: eventId, user_id: user.id, note: cleanNote });
        if (noteInsertError) {
          // They wrote a note we couldn't save; better to ask again than to send it without.
          await supabase.from("rsvps").delete().eq("event_id", eventId).eq("user_id", user.id);
          return { error: "Couldn't send your request. Please try again." };
        }
      }
      // Tell the host, without making the requester wait for the email.
      waitUntil(notifyHostOfRequest(eventId, user.id));
    }
  } else {
    const { error } = await supabase
      .from("rsvps")
      .delete()
      .eq("event_id", eventId)
      .eq("user_id", user.id);
    if (error) return { error: "Couldn't leave. Please try again." };
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/");
  revalidatePath("/me");
  return {};
}

export async function deleteEvent(eventId: string): Promise<{ error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Deleting removes the guest list too, so look up who was going first. This only reads; nobody
  // is told unless the delete below really happens.
  const guestsToTell = await snapshotBeforeDelete(eventId);

  // RLS limits this to the host's own events; an empty result means nothing was deleted.
  const { data, error } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId)
    .select("id");

  if (error || !data || data.length === 0) {
    return { error: "Couldn't delete this event." };
  }

  if (guestsToTell) waitUntil(notifyEventDeleted(guestsToTell));

  revalidatePath("/");
  revalidatePath("/me");
  redirect("/");
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function reportEvent(
  eventId: string,
  reason: string,
  details: string
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in to report a meetup." };

  if (!(REPORT_REASONS as readonly string[]).includes(reason)) {
    return { error: "Pick a reason." };
  }
  const trimmed = details.trim().slice(0, 500);

  const { error } = await supabase
    .from("reports")
    .insert({ event_id: eventId, reporter_id: user.id, reason, details: trimmed });
  // 23505 = this user already reported this event; treat as success.
  if (error && error.code !== "23505") {
    return { error: "Couldn't send your report. Please try again." };
  }

  // Email the moderator, but only for a new report so repeat clicks can't spam the inbox.
  if (!error) {
    const { data: event } = await supabase
      .from("events")
      .select("title, host:profiles!host_id(name)")
      .eq("id", eventId)
      .maybeSingle();
    const host = event?.host as { name?: string } | { name?: string }[] | null | undefined;
    await sendReportAlert({
      eventId,
      eventTitle: event?.title ?? "(unknown event)",
      hostName: (Array.isArray(host) ? host[0]?.name : host?.name) ?? "",
      reason,
      details: trimmed,
      reporterEmail: user.email ?? "",
    });
  }
  return {};
}

/** Host-only (enforced by RLS). An empty value removes the link. */
export async function setChatLink(eventId: string, raw: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in." };

  if (!raw.trim()) {
    const { error } = await supabase.from("event_chat_links").delete().eq("event_id", eventId);
    if (error) return { error: "Couldn't remove the link. Please try again." };
  } else {
    const parsed = parseChatUrl(raw);
    if ("error" in parsed) return { error: parsed.error };

    const { error } = await supabase
      .from("event_chat_links")
      .upsert({ event_id: eventId, url: parsed.url }, { onConflict: "event_id" });
    if (error) return { error: "Couldn't save the link. Please try again." };
  }

  revalidatePath(`/events/${eventId}`);
  return {};
}

export type CompleteProfileResult = {
  errors: { name?: string; birthdate?: string };
};

/** First-login onboarding: display name and (private) birthday. Redirects to `next` on success. */
export async function completeProfile(formData: FormData, next: string): Promise<CompleteProfileResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const field = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v.trim() : "";
  };

  const errors: CompleteProfileResult["errors"] = {};
  const name = field("name");
  if (!name) errors.name = "Enter your name.";
  else if (name.length > 50) errors.name = "Keep it under 50 characters.";

  const birth = parseBirthDate(field("birth_year"), field("birth_month"), field("birth_day"));
  if (!birth) errors.birthdate = "Enter your full birthday.";
  else if (ageOn(birth, pacificDate()) < MIN_AGE) {
    errors.birthdate = `BayMeet is for people ${MIN_AGE} and older.`;
  }
  if (Object.keys(errors).length > 0) return { errors };

  const { error: birthError } = await supabase
    .from("profile_private")
    .insert({ user_id: user.id, birth_date: birth });
  // 23505 = already set (e.g. a double submit). The birthday is locked once saved.
  if (birthError && birthError.code !== "23505") {
    return { errors: { birthdate: "Couldn't save that. Please try again." } };
  }

  const { error: nameError } = await supabase.from("profiles").update({ name }).eq("id", user.id);
  if (nameError) return { errors: { name: "Couldn't save your name. Please try again." } };

  revalidatePath("/", "layout");
  // Next stop is choosing interests (the welcome page forwards on if that's already done).
  redirect(`/welcome?next=${encodeURIComponent(safeNext(next))}`);
}

/** Host approves or declines a pending request. RLS limits this to the event's host. */
export async function respondToRequest(
  eventId: string,
  userId: string,
  decision: "approve" | "decline"
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in." };

  const { data, error } = await supabase
    .from("rsvps")
    .update({ status: decision === "approve" ? "approved" : "declined" })
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .select("user_id");

  if (error) {
    return {
      error: error.message.includes("full")
        ? "You're out of spots. Decline someone or free one up first."
        : error.message.includes("cancelled")
          ? "This meetup was cancelled."
          : "Couldn't update that request. Please try again.",
    };
  }
  if (!data || data.length === 0) return { error: "That request is no longer pending." };

  waitUntil(notifyRequestDecision(eventId, userId, decision === "approve"));
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/me");
  revalidatePath("/");
  return {};
}

/** Host-only (row level security). The database rejects going below the number already going. */
export async function updateMaxSpots(eventId: string, maxSpots: number): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in." };

  const invalid = validateMaxSpots(maxSpots);
  if (invalid) return { error: invalid };

  const { data, error } = await supabase
    .from("events")
    .update({ max_spots: maxSpots })
    .eq("id", eventId)
    .select("id");

  if (error) {
    return {
      error: error.message.includes("events_spots_within_capacity")
        ? "That's fewer than the number of people already going."
        : error.message.includes("events_max_spots_range")
          ? (validateMaxSpots(maxSpots) ?? "Choose a number from 1 to 200.")
          : "Couldn't update the spots. Please try again.",
    };
  }
  if (!data || data.length === 0) return { error: "Only the host can change this." };

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/");
  revalidatePath("/me");
  return {};
}

/** Host-only. Marks the event cancelled; only a moderator can reinstate it. */
export async function cancelEvent(eventId: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in." };

  // cancelled_at can't be written directly (only a moderator can clear it), so hosts go through
  // this database function, which checks they own the event.
  const { error } = await supabase.rpc("cancel_event", { eid: eventId });
  if (error) return { error: "Couldn't cancel this meetup. Please try again." };

  waitUntil(notifyEventCancelled(eventId));

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/");
  revalidatePath("/me");
  return {};
}

/** Saves interests. With `next` it continues there (onboarding); without, it just returns. */
export async function saveInterests(categories: string[], next?: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const clean = Array.from(new Set(categories.filter(isCategory)));
  const { error } = await updateOrInsert(
    supabase,
    "user_interests",
    { user_id: user.id },
    { categories: clean, updated_at: new Date().toISOString() }
  );
  if (error) return { error: "Couldn't save your interests. Please try again." };

  revalidatePath("/", "layout");
  if (next) redirect(safeNext(next));
  return {};
}

/** Swipe left: hide an event from this person's swipe deck. */
export async function passEvent(eventId: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};
  const { error } = await supabase.from("event_passes").insert({ user_id: user.id, event_id: eventId });
  // 23505 = already passed.
  if (error && error.code !== "23505") return { error: "Couldn't save that." };
  return {};
}

export async function unpassEvent(eventId: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};
  await supabase.from("event_passes").delete().eq("user_id", user.id).eq("event_id", eventId);
  return {};
}

/** The on/off switch for BayMeet's emails (requests, approvals, cancellations, reminders). */
export async function setEmailNotifications(enabled: boolean): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in." };

  const { error } = await updateOrInsert(
    supabase,
    "user_settings",
    { user_id: user.id },
    { email_notifications: enabled, updated_at: new Date().toISOString() }
  );
  if (error) return { error: "Couldn't save that. Please try again." };
  revalidatePath("/me");
  return {};
}

/** A guest's private "would you join this meetup again?" answer. The database checks they're allowed. */
export async function submitFeedback(eventId: string, wouldJoinAgain: boolean): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in." };

  const { error } = await updateOrInsert(
    supabase,
    "meetup_feedback",
    { event_id: eventId, user_id: user.id },
    { would_join_again: wouldJoinAgain }
  );
  if (error) {
    return {
      error: error.message.includes("Only guests who joined")
        ? "Only guests who joined this meetup can rate it."
        : error.message.includes("once the meetup has started")
          ? "You can rate it once it has started."
          : error.message.includes("cancelled")
            ? "This meetup was cancelled."
            : "Couldn't save that. Please try again.",
    };
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/me");
  return {};
}

// A short pause between test emails per person, so the button can't be used to burn the mail quota.
const lastTest = new Map<string, number>();

/** Checks every link in the email chain and sends a real test email to the signed-in person. */
export async function sendTestEmail(): Promise<{ checks?: Check[]; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: "Please log in." };

  const now = Date.now();
  if (now - (lastTest.get(user.id) ?? 0) < 30_000) return { error: "Please wait a few seconds before trying again." };
  lastTest.set(user.id, now);

  const { data: profile } = await supabase.from("profiles").select("name").eq("id", user.id).maybeSingle();
  return { checks: await diagnoseEmail({ userId: user.id, userEmail: user.email, name: profile?.name ?? "" }) };
}

/** Remember a device for push notifications. Done by the server, which checks who is really asking. */
export async function savePushSubscription(device: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in." };

  if (
    typeof device?.endpoint !== "string" ||
    typeof device?.p256dh !== "string" ||
    typeof device?.auth !== "string" ||
    !isPushEndpoint(device.endpoint) ||
    device.p256dh.length > 200 ||
    device.auth.length > 100
  ) {
    return { error: "That device isn't supported." };
  }

  const admin = createAdminClient();
  if (!admin || !pushConfigured()) return { error: "Push notifications aren't set up on the server yet." };

  // Keyed by the device's address, so a phone that changes hands follows whoever is signed in.
  const { error } = await admin
    .from("push_subscriptions")
    .upsert(
      { user_id: user.id, endpoint: device.endpoint, p256dh: device.p256dh, auth: device.auth },
      { onConflict: "endpoint" }
    );
  if (error) return { error: "Couldn't turn push on. Please try again." };
  return {};
}

/** Forget a device. The database only lets people remove their own. */
export async function removePushSubscription(endpoint: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) return { error: "Couldn't turn push off. Please try again." };
  return {};
}

const lastPushTest = new Map<string, number>();

/** Checks every link of the push chain and sends a real test notification to the signed-in person's devices. */
export async function sendTestPush(): Promise<{ checks?: Check[]; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in." };

  const now = Date.now();
  if (now - (lastPushTest.get(user.id) ?? 0) < 15_000) return { error: "Please wait a few seconds before trying again." };
  lastPushTest.set(user.id, now);

  return { checks: await diagnosePush({ userId: user.id }) };
}

/** Saves "about you". With `next` it continues there (onboarding); without, it just returns. */
export async function saveAbout(
  input: AboutInput,
  next?: string
): Promise<{ errors?: AboutErrors; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = parseAbout(input);
  if (!parsed.ok) return { errors: parsed.errors };

  const { error } = await updateOrInsert(
    supabase,
    "profile_bios",
    { user_id: user.id },
    {
      bio: parsed.value.bio,
      linkedin: parsed.value.linkedin,
      instagram: parsed.value.instagram,
      x_handle: parsed.value.x_handle,
      tiktok: parsed.value.tiktok,
      facebook: parsed.value.facebook,
      updated_at: new Date().toISOString(),
    }
  );
  if (error) return { error: "Couldn't save that. Please try again." };

  revalidatePath("/me");
  if (next) redirect(safeNext(next));
  return {};
}
