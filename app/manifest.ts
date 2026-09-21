import type { MetadataRoute } from "next";
import { BRAND, iconUrl } from "@/lib/brand";
import { SITE_NAME, TAGLINE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: TAGLINE,
    start_url: "/",
    display: "standalone",
    background_color: BRAND.cream,
    theme_color: BRAND.cream,
    icons: [
      { src: iconUrl(192), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: iconUrl(512), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: iconUrl(512), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
