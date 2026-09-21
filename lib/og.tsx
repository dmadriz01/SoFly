import { BRAND } from "./brand";
import { iconSvg } from "./butterfly";
import { INTER_BOLD_BASE64 } from "./inter-bold";

export const COLORS = BRAND;

export const OG_SIZE = { width: 1200, height: 630 };

export async function loadBoldFont() {
  const buf = Buffer.from(INTER_BOLD_BASE64, "base64");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

/** A finished SVG as an image address, for the preview-image renderer. */
export const svgDataUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

/** Square brand mark used for favicons and app icons: the butterfly on a deep-green tile. Full-bleed so OSes can mask it. */
export function BrandMark({ size }: { size: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={svgDataUri(iconSvg())} width={size} height={size} alt="" />;
}

/** The app icon and "SoFly", for the link-preview images. */
export function Wordmark({ size }: { size: number }) {
  const tile = Math.round(size * 0.95);
  return (
    <div style={{ display: "flex", alignItems: "center", fontSize: size, fontWeight: 700, letterSpacing: -2 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={svgDataUri(iconSvg())} width={tile} height={tile} alt="" style={{ marginRight: size * 0.16, borderRadius: Math.round(tile * 0.22) }} />
      <span style={{ color: COLORS.ink }}>So</span>
      <span style={{ color: COLORS.accent }}>Fly</span>
    </div>
  );
}
