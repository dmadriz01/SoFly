// SoFly's colors, in ONE place. The site's styling, the app icon, the link-preview images and the
// emails all read from here, so changing the look is a single edit.
export const BRAND = {
  cream: "#f8f4ec", // page background: the sand, lightened
  sand: "#e8dcc4", // warm surfaces (soft backgrounds) and borders
  ink: "#123f36", // deep green: main text
  muted: "#41655e", // secondary text (still 4.5:1+ on every background it sits on)
  line: "#e8dcc4", // borders
  accent: "#2a6b5c", // teal green: buttons, links, highlights
  accentDark: "#123f36", // deep green: hover states and text on tinted backgrounds
  accentSoft: "#e8dcc4", // sand: soft backgrounds (pills, the active tab, notes)
  gold: "#c49a45", // decoration ONLY (lines, the icon letter, small marks): too light to be text
} as const;

/**
 * Appended to every icon URL. Icons are cached for a year (and phones keep their own copy), so a
 * new colour or picture only shows up if the URL changes too. It follows the accent colour by
 * itself; bump ICON_REV when the icon changes for any other reason.
 */
const ICON_REV = 2;
export const ICON_VERSION = `${BRAND.accent.slice(1)}-${ICON_REV}`;

/** The icon sizes served by app/pwa-icon/[size]. */
export const ICON_SIZES = [64, 180, 192, 512] as const;
export const iconUrl = (size: (typeof ICON_SIZES)[number]) => `/pwa-icon/${size}?v=${ICON_VERSION}`;

/** A colour a fraction of the way from one to another, e.g. mixHex(gold, "#ffffff", 0.3) for a lighter gold. */
export function mixHex(a: string, b: string, t: number): string {
  const from = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const to = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + from.map((v, i) => Math.round(v + (to[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
