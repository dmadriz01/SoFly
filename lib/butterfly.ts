import { BRAND, mixHex } from "./brand";

// The SoFly butterfly, drawn in code so it stays sharp at any size and always uses the palette. It
// is used for the app icon, the favicon, the logo in the page header and the link-preview images (all the same deep-green tile).
// Only numbers and colours from the palette go into the markup, never text.

export type ButterflyColors = {
  /** The bigger, upper wings. */
  upper: string;
  /** The smaller, lower wings. */
  lower: string;
  /** The body and antennae. */
  body: string;
  /** The spots on the wings. */
  spot: string;
};

/** For the deep-green app icon: gold wings with sand details. */
export const ON_DARK: ButterflyColors = { upper: BRAND.gold, lower: mixHex(BRAND.gold, "#ffffff", 0.3), body: BRAND.sand, spot: BRAND.accentDark };

// One side of the butterfly, drawn on a 100 x 100 grid with the body on x = 50. The other side is
// this one mirrored.
const UPPER_WING = "M50 47C51 27 66 11 86 12C97 13 96 29 88 41C80 52 63 54 50 50Z";
const LOWER_WING = "M50 53C63 53 78 55 81 67C84 80 70 90 61 81C54 74 51 64 50 57Z";

function side(c: ButterflyColors) {
  return (
    `<path d="${UPPER_WING}" fill="${c.upper}"/>` +
    `<path d="${LOWER_WING}" fill="${c.lower}"/>` +
    `<circle cx="76" cy="27" r="6" fill="${c.spot}" opacity="0.9"/>` +
    `<circle cx="70" cy="70" r="3.6" fill="${c.spot}" opacity="0.85"/>` +
    `<path d="M49 32C47 22 41 16 35 14" fill="none" stroke="${c.body}" stroke-width="2.2" stroke-linecap="round"/>` +
    `<circle cx="35" cy="14" r="2.2" fill="${c.body}"/>`
  );
}

/** The butterfly on a 100 x 100 grid (no background), as SVG elements. */
export function butterflyMarkup(c: ButterflyColors): string {
  return (
    `<g>${side(c)}</g>` +
    `<g transform="translate(100 0) scale(-1 1)">${side(c)}</g>` +
    `<rect x="47.2" y="30" width="5.6" height="46" rx="2.8" fill="${c.body}"/>`
  );
}

/** A finished SVG. `tile` adds a full-bleed background with the butterfly at 76% size (an app icon). */
export function butterflySvg(colors: ButterflyColors, tile?: { background: string }): string {
  const inner = tile
    ? `<rect width="100" height="100" fill="${tile.background}"/><g transform="translate(12 12) scale(0.76)">${butterflyMarkup(colors)}</g>`
    : butterflyMarkup(colors);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${inner}</svg>`;
}

/** The app icon: the butterfly on a deep-green tile. */
export const iconSvg = () => butterflySvg(ON_DARK, { background: BRAND.accentDark });
