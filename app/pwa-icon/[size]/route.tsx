import { ImageResponse } from "next/og";
import { ICON_SIZES } from "@/lib/brand";
import { BrandMark, loadBoldFont } from "@/lib/og";

// Serves every app icon: the browser tab icon (64), the iPhone home-screen icon (180) and the
// manifest icons (192, 512). URLs come from iconUrl() in lib/brand.ts and carry a version.
export async function GET(_req: Request, { params }: { params: { size: string } }) {
  const size = ICON_SIZES.find((s) => String(s) === params.size);
  if (!size) return new Response("Not found", { status: 404 });
  const font = await loadBoldFont();
  return new ImageResponse(<BrandMark size={size} />, {
    width: size,
    height: size,
    fonts: [{ name: "Inter", data: font, weight: 700 }],
  });
}
