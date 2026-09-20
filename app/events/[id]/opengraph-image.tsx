import { ImageResponse } from "next/og";
import { COLORS, OG_SIZE, Wordmark, loadBoldFont } from "@/lib/og";
import { createPublicClient } from "@/lib/supabase/public";
import { formatWhenLong } from "@/lib/time";

export const alt = "BayMeet meetup";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: { id: string } }) {
  const [font, { data: event }] = await Promise.all([
    loadBoldFont(),
    createPublicClient()
      .from("events")
      .select("title, category, venue_name, neighborhood, starts_at, max_spots, cancelled_at, spots_taken")
      .eq("id", params.id)
      .maybeSingle(),
  ]);

  const fonts = [{ name: "Inter", data: font, weight: 700 as const }];

  if (!event) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: COLORS.cream,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "Inter",
          }}
        >
          <Wordmark size={150} />
        </div>
      ),
      { ...size, fonts }
    );
  }

  const when = formatWhenLong(event.starts_at);
  const left = Math.max(event.max_spots - event.spots_taken, 0);
  const title = event.title.length > 90 ? `${event.title.slice(0, 87)}…` : event.title;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: COLORS.cream,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 70,
          fontFamily: "Inter",
          borderBottom: `24px solid ${COLORS.accent}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              display: "flex",
              background: COLORS.accentSoft,
              color: COLORS.accentDark,
              fontSize: 34,
              padding: "10px 28px",
              borderRadius: 999,
            }}
          >
            {event.category}
          </div>
          <Wordmark size={52} />
        </div>

        <div
          style={{
            display: "flex",
            fontSize: title.length > 50 ? 68 : 84,
            lineHeight: 1.08,
            letterSpacing: -2,
            color: COLORS.ink,
          }}
        >
          {title}
        </div>

        <div style={{ display: "flex", flexDirection: "column", fontSize: 38, color: COLORS.muted }}>
          <div style={{ display: "flex", color: COLORS.accentDark }}>
            {when.day} · {when.time}
          </div>
          <div style={{ display: "flex", marginTop: 8 }}>
            {event.neighborhood} · {event.venue_name}
          </div>
          <div style={{ display: "flex", marginTop: 8 }}>
            {event.cancelled_at ? "This meetup was cancelled" : `${left} of ${event.max_spots} spots left`}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
