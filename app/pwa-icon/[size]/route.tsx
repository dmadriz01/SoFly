import { ImageResponse } from "next/og";
import { BrandMark, loadBoldFont } from "@/lib/og";

// Serves the 192px and 512px icons referenced by app/manifest.ts.
export async function GET(_req: Request, { params }: { params: { size: string } }) {
  const size = params.size === "512" ? 512 : 192;
  const font = await loadBoldFont();
  return new ImageResponse(<BrandMark size={size} />, {
    width: size,
    height: size,
    fonts: [{ name: "Inter", data: font, weight: 700 }],
  });
}
