import { ImageResponse } from "next/og";
import { eventOgImage } from "@/lib/event-og";
import { COLORS, OG_SIZE, Wordmark, loadBoldFont } from "@/lib/og";
import { createPublicClient } from "@/lib/supabase/public";

export const alt = "BayMeet meetup";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: { id: string } }) {
  const [font, { data: event }] = await Promise.all([
    loadBoldFont(),
    createPublicClient()
      .from("events")
      .select("id, title, category, venue_name, neighborhood, starts_at, max_spots, cancelled_at, spots_taken, skill_level")
      .eq("id", params.id)
      .maybeSingle(),
  ]);

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
      { ...size, fonts: [{ name: "Inter", data: font, weight: 700 as const }] }
    );
  }

  return eventOgImage(event, font);
}
