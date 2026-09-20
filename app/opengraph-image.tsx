import { ImageResponse } from "next/og";
import { COLORS, OG_SIZE, Wordmark, loadBoldFont } from "@/lib/og";
import { TAGLINE } from "@/lib/site";

export const alt = "BayMeet: meetups around the Bay Area";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  const font = await loadBoldFont();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: COLORS.cream,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 90,
          fontFamily: "Inter",
          borderBottom: `24px solid ${COLORS.accent}`,
        }}
      >
        <Wordmark size={150} />
        <div
          style={{
            display: "flex",
            marginTop: 30,
            fontSize: 48,
            lineHeight: 1.25,
            color: COLORS.muted,
            maxWidth: 900,
          }}
        >
          {TAGLINE}
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Inter", data: font, weight: 700 }] }
  );
}
