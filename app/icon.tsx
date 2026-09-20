import { ImageResponse } from "next/og";
import { BrandMark, loadBoldFont } from "@/lib/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default async function Icon() {
  const font = await loadBoldFont();
  return new ImageResponse(<BrandMark size={64} />, {
    ...size,
    fonts: [{ name: "Inter", data: font, weight: 700 }],
  });
}
