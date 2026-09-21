export const SITE_NAME = "SoFly";
export const TAGLINE = "Find people to play, run, climb and hang out with around the Bay Area.";

/**
 * Canonical origin, used for link previews. Set NEXT_PUBLIC_SITE_URL once you have a
 * custom domain; until then Vercel's production URL is used automatically.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

/** Where feedback, reports and privacy requests go. Set NEXT_PUBLIC_CONTACT_EMAIL. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";
