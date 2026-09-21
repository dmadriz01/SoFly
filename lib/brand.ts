// SoFly's colors, in ONE place. The site's styling, the app icon, the link-preview images and the
// emails all read from here, so changing the look is a single edit.
export const BRAND = {
  cream: "#f8f4ec", // page background: the sand, lightened
  sand: "#e8dcc4", // warm surfaces (soft backgrounds) and borders
  surface: "#ffffff", // cards, inputs and sheets
  ink: "#123f36", // deep green: main text
  muted: "#41655e", // secondary text (still 4.5:1+ on every background it sits on)
  line: "#e8dcc4", // borders
  accent: "#2a6b5c", // teal green: buttons, links, highlights
  accentDark: "#123f36", // deep green: hover states and text on tinted backgrounds
  accentSoft: "#e8dcc4", // sand: soft backgrounds (pills, the active tab, notes)
  onAccent: "#ffffff", // text on an accent-coloured button or badge
  gold: "#c49a45", // decoration ONLY (lines, the icon letter, small marks): too light to be text
  danger: "#b91c1c", // errors and destructive actions (text)
  dangerStrong: "#991b1b", // text on the soft red background
  dangerSoft: "#fef2f2", // soft red background (cancelled badges, warnings)
  dangerLine: "#fecaca", // soft red border
  warnStrong: "#78350f", // text on the soft amber background
  warnSoft: "#fffbeb", // soft amber background (notices)
  warnLine: "#fde68a", // soft amber border
} as const;

/**
 * The colours the screens switch between. Light is BRAND above; this is the dark version, used when
 * the phone or computer is in dark mode (or the person picked Dark). The app icon, emails and link
 * previews always use the light colours in BRAND. Gold and sand are decoration and don't change.
 */
export const THEME_TOKENS = [
  "cream", "surface", "ink", "muted", "line", "accent", "accentDark", "accentSoft", "onAccent",
  "danger", "dangerStrong", "dangerSoft", "dangerLine", "warnStrong", "warnSoft", "warnLine",
] as const;
export type ThemeToken = (typeof THEME_TOKENS)[number];

export const BRAND_DARK: Record<ThemeToken, string> = {
  cream: "#0c1c18", // page background: a very deep green
  surface: "#132a25", // cards, inputs and sheets
  ink: "#f1ead9", // main text: warm off-white
  muted: "#a9beb6", // secondary text
  line: "#28504a", // borders
  accent: "#5cbfa8", // teal, lighter so links and buttons stand out on dark
  accentDark: "#b9e8db", // pale teal: text on tinted backgrounds, hover
  accentSoft: "#1b3d36", // soft backgrounds
  onAccent: "#06201a", // text on an accent button (dark on the lighter teal)
  danger: "#ff8f86",
  dangerStrong: "#ffb4ad",
  dangerSoft: "#3b1c1a",
  dangerLine: "#6e3230",
  warnStrong: "#f2d78c",
  warnSoft: "#33290f",
  warnLine: "#6e5b22",
};

/** The two values the browser's theme colour (the bar around the page on a phone) can take. */
export const THEME_COLOR = { light: BRAND.cream, dark: BRAND_DARK.cream } as const;

/** "#123f36" -> "18 63 54": the form Tailwind needs so classes like text-ink/80 still work. */
export const rgbTriplet = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");
/** "accentDark" -> "accent-dark" (the name used in CSS). */
export const kebab = (token: string) => token.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());

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
