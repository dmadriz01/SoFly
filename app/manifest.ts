import type { MetadataRoute } from "next";
import { iconUrl } from "@/lib/brand";
import { SITE_NAME, TAGLINE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: TAGLINE,
    start_url: "/",
    display: "standalone",
    background_color: "#fbf8f3",
    theme_color: "#fbf8f3",
    icons: [
      { src: iconUrl(192), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: iconUrl(512), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: iconUrl(512), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
