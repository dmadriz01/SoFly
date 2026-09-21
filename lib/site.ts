export const SITE_NAME = "SoFly";
export const TAGLINE = "Find people to play, run, climb and hang out with in your city.";

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

/** The feed's headline and the sentence under it: the first thing you see on the Feed. */
export const FEED_HEADLINE = ["Do more things", "with real people."] as const;
export const FEED_INTRO = "Pickup games, dinners and coffee chats in your city. Find one you like and join in a tap.";
