import { INTER_BOLD_BASE64 } from "./inter-bold";

export const COLORS = {
  cream: "#fbf8f3",
  ink: "#2b2622",
  muted: "#7d726a",
  line: "#ebe2d7",
  accent: "#d9552f",
  accentDark: "#bd4523",
  accentSoft: "#fcebe4",
};

export const OG_SIZE = { width: 1200, height: 630 };

export async function loadBoldFont() {
  const buf = Buffer.from(INTER_BOLD_BASE64, "base64");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

/** Square brand mark used for favicons and app icons. Full-bleed so OSes can mask it. */
export function BrandMark({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        background: COLORS.accent,
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.68,
        fontWeight: 700,
        fontFamily: "Inter",
      }}
    >
      B
    </div>
  );
}

export function Wordmark({ size }: { size: number }) {
  return (
    <div style={{ display: "flex", fontSize: size, fontWeight: 700, letterSpacing: -2 }}>
      <span style={{ color: COLORS.ink }}>Bay</span>
      <span style={{ color: COLORS.accent }}>Meet</span>
    </div>
  );
}
