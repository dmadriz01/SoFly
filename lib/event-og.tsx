import { ImageResponse } from "next/og";
import { coverSvg } from "./cover";
import { COLORS, OG_SIZE, Wordmark } from "./og";
import { formatWhenLong } from "./time";

export type OgEvent = {
  id: string;
  title: string;
  category: string;
  venue_name: string;
  neighborhood: string;
  starts_at: string;
  max_spots: number;
  spots_taken: number;
  cancelled_at: string | null;
  skill_level: string;
};

/** The link-preview picture for a meetup: its generated cover art with the details on a card. */
export function eventOgImage(event: OgEvent, font: ArrayBuffer) {
  const size = OG_SIZE;
  const fonts = [{ name: "Inter", data: font, weight: 700 as const }];
  const when = formatWhenLong(event.starts_at);
  const left = Math.max(event.max_spots - event.spots_taken, 0);
  const title = event.title.length > 90 ? `${event.title.slice(0, 87)}…` : event.title;
  // The meetup's generated cover picture (only public details go into it) fills the image. It is
  // drawn at 2:1, so it is shown at exactly 3x (1200x600) to keep its proportions.
  const cover = `data:image/svg+xml;base64,${Buffer.from(
    coverSvg({ id: event.id, category: event.category, neighborhood: event.neighborhood, startsAt: event.starts_at, skill: event.skill_level, maxSpots: event.max_spots })
  ).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: COLORS.accent,
          display: "flex",
          fontFamily: "Inter",
          position: "relative",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cover} width={size.width} height={600} alt="" style={{ position: "absolute", top: 0, left: 0, opacity: event.cancelled_at ? 0.45 : 1 }} />
        {/* The brand and category ride on the sky as small chips... */}
        <div style={{ position: "absolute", top: 28, left: 40, right: 40, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", background: COLORS.cream, borderRadius: 999, padding: "8px 26px", border: `2px solid ${COLORS.line}` }}>
            <Wordmark size={40} />
          </div>
          <div style={{ display: "flex", background: COLORS.accentSoft, color: COLORS.accentDark, fontSize: 30, padding: "12px 28px", borderRadius: 999, border: `2px solid ${COLORS.line}` }}>
            {event.category}
          </div>
        </div>
        {/* ...and the details sit on a slim card at the bottom, so the sky, sun and landmarks stay visible. */}
        <div
          style={{
            position: "absolute",
            bottom: 34,
            left: 40,
            right: 40,
            display: "flex",
            flexDirection: "column",
            background: COLORS.cream,
            borderRadius: 36,
            padding: "24px 44px 26px",
            border: `2px solid ${COLORS.line}`,
          }}
        >
          <div style={{ display: "flex", fontSize: title.length > 50 ? 50 : 62, lineHeight: 1.08, letterSpacing: -2, color: COLORS.ink }}>
            {title}
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 12, fontSize: 30, color: COLORS.muted }}>
            <div style={{ display: "flex", color: COLORS.accentDark }}>
              {when.day} · {when.time}
            </div>
            <div style={{ display: "flex", marginTop: 4 }}>
              {event.neighborhood} · {event.venue_name}
              {event.cancelled_at ? " · Cancelled" : ` · ${left} of ${event.max_spots} spots left`}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
