"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseChatUrl } from "@/lib/chat";
import { REPORT_REASONS } from "@/lib/constants";
import { pacificLocalToUtc } from "@/lib/time";
import { EVENT_FIELDS, validateEvent, type EventErrors } from "@/lib/validation";

export type CreateEventResult = { errors: EventErrors; formError?: string };

export async function createEvent(formData: FormData): Promise<CreateEventResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/events/new");

  const input: Record<string, string> = {};
  for (const field of EVENT_FIELDS) {
    const value = formData.get(field);
    input[field] = typeof value === "string" ? value.trim() : "";
  }

  const errors = validateEvent(input);
  if (Object.keys(errors).length > 0) return { errors };

  const { data, error } = await supabase
    .from("events")
    .insert({
      host_id: user.id,
      title: input.title,
      category: input.category,
      neighborhood: input.neighborhood,
      venue_name: input.venue_name,
      address: input.address,
      starts_at: pacificLocalToUtc(input.starts_at)!.toISOString(),
      max_spots: Number(input.max_spots),
      description: input.description,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { errors: {}, formError: "Something went wrong posting your meetup. Please try again." };
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

export async function setRsvp(eventId: string, join: boolean): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in to join." };

  if (join) {
    const { error } = await supabase
      .from("rsvps")
      .insert({ event_id: eventId, user_id: user.id });
    // 23505 = already joined; treat as success.
    if (error && error.code !== "23505") {
      return {
        error: error.message.includes("full")
          ? "Sorry, this event just filled up."
          : "Couldn't join. Please try again.",
      };
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

  // RLS limits this to the host's own events; an empty result means nothing was deleted.
  const { data, error } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId)
    .select("id");

  if (error || !data || data.length === 0) {
    return { error: "Couldn't delete this event." };
  }

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
