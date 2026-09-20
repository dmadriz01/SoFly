import { ImageResponse } from "next/og";
import { BrandMark, loadBoldFont } from "@/lib/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const font = await loadBoldFont();
  return new ImageResponse(<BrandMark size={180} />, {
    ...size,
    fonts: [{ name: "Inter", data: font, weight: 700 }],
  });
}
