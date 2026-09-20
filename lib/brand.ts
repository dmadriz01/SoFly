// BayMeet's colors, in ONE place. The site's styling, the app icon, the link-preview images and the
// emails all read from here, so changing the look is a single edit.
export const BRAND = {
  cream: "#fbf8f3", // page background
  ink: "#2b2622", // main text
  muted: "#7d726a", // secondary text
  line: "#ebe2d7", // borders
  accent: "#64732c", // olive: buttons, links, highlights
  accentDark: "#4a571f", // olive, darker: hover states and text on tinted backgrounds
  accentSoft: "#eef1dc", // olive tint: soft backgrounds
} as const;

/**
 * Appended to every icon URL. Icons are cached for a year (and phones keep their own copy), so a
 * new colour or letter only shows up if the URL changes too. It follows the accent colour by
 * itself; bump ICON_REV when the icon changes for any other reason.
 */
const ICON_REV = 1;
export const ICON_VERSION = `${BRAND.accent.slice(1)}-${ICON_REV}`;

/** The icon sizes served by app/pwa-icon/[size]. */
export const ICON_SIZES = [64, 180, 192, 512] as const;
export const iconUrl = (size: (typeof ICON_SIZES)[number]) => `/pwa-icon/${size}?v=${ICON_VERSION}`;
