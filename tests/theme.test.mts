// Dark mode / light mode / follow-the-device, and the Feed intro text. `npm run test:unit`.
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BRAND, BRAND_DARK, THEME_COLOR, THEME_TOKENS, kebab, mixHex, rgbTriplet } from "../lib/brand.ts";
import { CATEGORIES, CATEGORY_STYLES } from "../lib/constants.ts";
import { FEED_HEADLINE, FEED_INTRO } from "../lib/site.ts";
import { THEME_CHOICES, THEME_COOKIE, readTheme, themeCookie } from "../lib/theme.ts";

let passed = 0;
let failed = 0;
const t = (name: string, cond: boolean, extra = "") => {
  cond ? passed++ : failed++;
  console.log(`${cond ? "ok   " : "FAIL "}${name}${cond ? "" : "  -> " + extra}`);
};
const root = process.cwd();
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const AA = 4.5;

// ───────── the two palettes ─────────
{
  const hex = /^#[0-9a-f]{6}$/i;
  t("palette: every colour the screens use is defined for light AND dark", THEME_TOKENS.every((k) => hex.test((BRAND as Record<string, string>)[k] ?? "") && hex.test(BRAND_DARK[k] ?? "")), THEME_TOKENS.filter((k) => !hex.test((BRAND as Record<string, string>)[k] ?? "") || !hex.test(BRAND_DARK[k] ?? "")).join());
  t("palette: dark really is dark and light really is light (page background)", lum(BRAND_DARK.cream) < 0.05 && lum(BRAND.cream) > 0.8);
  t("palette: dark text is light, and the page/card colours are ordered (page darker than cards)", lum(BRAND_DARK.ink) > 0.7 && lum(BRAND_DARK.surface) > lum(BRAND_DARK.cream) && lum(BRAND.surface) > lum(BRAND.cream));
  const pairs = (P: Record<string, string>, name: string) => {
    const pair: [string, string, string][] = [
      ["main text on the page", P.ink, P.cream], ["main text on cards", P.ink, P.surface], ["main text on the soft tint", P.ink, P.accentSoft],
      ["secondary text on the page", P.muted, P.cream], ["secondary text on cards", P.muted, P.surface], ["secondary text on the soft tint", P.muted, P.accentSoft],
      ["accent text on the page", P.accent, P.cream], ["accent text on cards", P.accent, P.surface], ["accent text on the soft tint", P.accent, P.accentSoft],
      ["dark-accent text on the soft tint", P.accentDark, P.accentSoft], ["text on an accent button", P.onAccent, P.accent], ["text on a hovered accent button", P.onAccent, P.accentDark],
      ["error text on the page", P.danger, P.cream], ["error text on cards", P.danger, P.surface], ["error text on its soft background", P.dangerStrong, P.dangerSoft], ["notice text on its soft background", P.warnStrong, P.warnSoft],
      ["the toast (page colour on the text colour)", P.cream, P.ink],
    ];
    const bad = pair.filter(([, a, b]) => contrast(a, b) < AA).map(([n, a, b]) => `${n} ${contrast(a, b).toFixed(2)}`);
    t(`palette (${name}): every text pairing is readable, 4.5:1 or better`, bad.length === 0, bad.join("; "));
  };
  pairs(BRAND as unknown as Record<string, string>, "light");
  pairs(BRAND_DARK, "dark");
  t("palette: in dark mode borders are visible against the page and cards are told apart from it", contrast(BRAND_DARK.line, BRAND_DARK.cream) >= 1.5 && contrast(BRAND_DARK.surface, BRAND_DARK.cream) >= 1.1);
  t("palette: gold (decoration) and sand are not themed: they're the same in both modes", !THEME_TOKENS.includes("gold" as never) && !THEME_TOKENS.includes("sand" as never));
  t("palette: the phone's bar colour matches the page in each mode", THEME_COLOR.light === BRAND.cream && THEME_COLOR.dark === BRAND_DARK.cream);
  t("palette helpers: mixing, RGB triplets and CSS names", mixHex("#000000", "#ffffff", 0.5) === "#808080" && mixHex("#123f36", "#123f36", 0.7) === "#123f36" && rgbTriplet("#123f36") === "18 63 54" && kebab("accentDark") === "accent-dark" && kebab("dangerSoft") === "danger-soft" && kebab("cream") === "cream");
}

// ───────── the stylesheet the app really gets ─────────
{
  const out = path.join(os.tmpdir(), `sofly-theme-${process.pid}.css`);
  execSync(`npx tailwindcss -i app/globals.css -o ${out}`, { cwd: root, stdio: "pipe" });
  const css = fs.readFileSync(out, "utf8");
  fs.rmSync(out, { force: true });
  const block = (start: string) => { const i = css.indexOf(start); if (i < 0) return ""; let depth = 0, j = css.indexOf("{", i); const from = j; for (; j < css.length; j++) { if (css[j] === "{") depth++; else if (css[j] === "}" && --depth === 0) break; } return css.slice(from, j + 1); };
  const vars = (b: string) => Object.fromEntries([...b.matchAll(/--([a-z-]+): ([\d ]+);/g)].map((m) => [m[1], m[2]]));
  const light = vars(block(":root {"));
  const systemDark = vars(block("@media (prefers-color-scheme: dark) {\n  :root:not([data-theme='light'])"));
  const chosenDark = vars(block(":root[data-theme='dark']"));
  const want = (P: Record<string, string>) => Object.fromEntries(THEME_TOKENS.map((k) => [kebab(k), rgbTriplet(P[k])]));
  t("stylesheet: the default (light) colours are on :root", JSON.stringify(light) === JSON.stringify(want(BRAND as unknown as Record<string, string>)), JSON.stringify(light).slice(0, 120));
  t("stylesheet: when the device is dark, the dark colours apply, unless the person chose Light", JSON.stringify(systemDark) === JSON.stringify(want(BRAND_DARK)) && css.includes(":root:not([data-theme='light'])"));
  t("stylesheet: when the person chose Dark, the same dark colours apply whatever the device says", JSON.stringify(chosenDark) === JSON.stringify(want(BRAND_DARK)));
  t("stylesheet: native controls (form fields, scrollbars) are told which mode this is", /:root \{[^}]*color-scheme: light/.test(css) && /:root:not\(\[data-theme='light'\]\) \{[^}]*color-scheme: dark/.test(css.replace(/\n\s*/g, " ").replace(/\s+/g, " ")) || /color-scheme: dark/.test(css));
  t("stylesheet: colour classes read the variables (so they switch with the theme)", /\.bg-surface \{[^}]*rgb\(var\(--surface\)/.test(css) && /\.text-ink \{[^}]*rgb\(var\(--ink\)/.test(css) && /\.text-on-accent \{[^}]*rgb\(var\(--on-accent\)/.test(css) && /\.border-danger-line \{[^}]*rgb\(var\(--danger-line\)/.test(css));
  t("stylesheet: opacity variants still work (e.g. text-ink/80, bg-surface/70)", /\.text-ink\\\/80 \{[^}]*rgb\(var\(--ink\) \/ 0\.8\)/.test(css) && /\.bg-surface\\\/70 \{[^}]*rgb\(var\(--surface\) \/ 0\.7\)/.test(css));
  t("stylesheet: the pastel category chips have dark versions, for a dark device and for a chosen Dark", css.includes(".dark\\:bg-amber-400\\/20:not([data-theme='light'] *)") && css.includes(".dark\\:bg-amber-400\\/20:is([data-theme='dark'] *)"));
  t("stylesheet: no colour is hard-coded from the old palette", !/#(64732c|4a571f|eef1dc|fbf8f3|2b2622)/i.test(css));
}

// ───────── nothing keeps a fixed light colour ─────────
{
  const walk = (dir: string): string[] => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : /\.(tsx|ts|css)$/.test(d.name) ? [path.join(dir, d.name)] : []));
  const files = [...walk("app"), ...walk("components")];
  // White is never allowed (use surface / on-accent). A raw red or amber is fine only where the same
  // class list also carries its dark:-version.
  const offenders = files.filter((f) => read(f).split("\n").some((l) => /\b(bg|text|border|ring)-white\b/.test(l) || (/\b(bg|text|border|ring)-(red|amber)-\d/.test(l) && !/dark:/.test(l))));
  t("no fixed light colours: no bg-white, text-white, or raw reds/ambers (they'd stay bright in dark mode)", offenders.length === 0, offenders.join(", "));
  const chips = ["lib/constants.ts", "components/Avatar.tsx", "components/EventTags.tsx", "components/PushSettings.tsx"].flatMap((f) => [...read(f).matchAll(/(?<![\w:-])bg-(\w+)-(\d+) text-(\w+)-(\d+)([^"'`]*)/g)].map((m) => ({ f, chip: m[0] })));
  t(`every pastel chip has a dark version (${chips.length} chips)`, chips.length >= 30 && chips.every((c) => /dark:bg-\w+-400\/20 dark:text-\w+-200/.test(c.chip)), chips.filter((c) => !/dark:/.test(c.chip)).map((c) => c.chip).join(" | "));
  t("every category badge has one", CATEGORIES.every((c) => /dark:bg-/.test(CATEGORY_STYLES[c]) && /dark:text-/.test(CATEGORY_STYLES[c])));
  const css = read("app/globals.css");
  t("the page's own background and text come from the theme colours", /body \{\s*@apply bg-cream text-ink/.test(css));
  const uses = [...walk("app"), ...walk("components"), ...walk("lib")].filter((f) => /BRAND_DARK/.test(read(f)) && !f.endsWith("brand.ts"));
  t("only the stylesheet reads the dark palette: the app icon, emails and link previews stay light", uses.length === 0 && /BRAND_DARK/.test(read("tailwind.config.ts")), uses.join(", "));
}

// ───────── choosing a theme ─────────
{
  t("theme: only 'light' and 'dark' are ever put on the page; anything else means follow the device", readTheme("light") === "light" && readTheme("dark") === "dark" && readTheme("system") === undefined && readTheme("") === undefined && readTheme(undefined) === undefined && readTheme(null) === undefined && readTheme('"><script>') === undefined && readTheme("LIGHT") === undefined && readTheme("dark ") === undefined);
  t("theme: three choices, Auto first", THEME_CHOICES.join() === "system,light,dark");
  t("theme: choosing Light or Dark is remembered for a year, for the whole site", /^sofly_theme=light; path=\/; max-age=31536000; samesite=lax$/.test(themeCookie("light")) && /^sofly_theme=dark; path=\/; max-age=31536000; samesite=lax$/.test(themeCookie("dark")) && THEME_COOKIE === "sofly_theme");
  t("theme: choosing Auto removes the cookie, so the device decides again", /^sofly_theme=; path=\/; max-age=0/.test(themeCookie("system")));
  const layout = read("app/layout.tsx");
  t("layout: the server reads the choice and puts it on <html>, so there's no flash of the wrong colours", /readTheme\(cookies\(\)\.get\(THEME_COOKIE\)\?\.value\)/.test(layout) && /<html lang="en" data-theme=\{theme\}>/.test(layout));
  t("layout: the phone's bar colour has a light and a dark version", /prefers-color-scheme: light\)", color: THEME_COLOR\.light/.test(layout) && /prefers-color-scheme: dark\)", color: THEME_COLOR\.dark/.test(layout));
  const toggle = read("components/ThemeToggle.tsx");
  t("toggle: it's a proper radio group (Auto, Light, Dark) that screen readers and keyboards understand", /role="radiogroup"/.test(toggle) && /role="radio"/.test(toggle) && /aria-checked=\{choice === o\.value\}/.test(toggle) && /label: "Auto"/.test(toggle) && /label: "Light"/.test(toggle) && /label: "Dark"/.test(toggle));
  t("toggle: it starts from what the page really is (after load, so server and browser agree)", /useEffect\(\(\) => setChoice\(currentTheme\(\)\), \[\]\)/.test(toggle));
  t("toggle: it's in the footer on every page (logged-out visitors too) and under 'Appearance' on Me", /<ThemeToggle size="sm" \/>/.test(read("components/Footer.tsx")) && /<h2[^>]*>Appearance<\/h2>[\s\S]{0,200}<ThemeToggle \/>/.test(read("app/me/page.tsx")));
}

// ───────── the Feed intro ─────────
{
  t("intro: the headline is exactly 'Do more things / with real people.'", FEED_HEADLINE.join(" ") === "Do more things with real people.");
  t("intro: the sentence under it is exactly the one asked for", FEED_INTRO === "Pickup games, dinners and coffee chats in your city. Find one you like and join in a tap.");
  const feed = read("app/(feed)/page.tsx");
  t("intro: the Feed shows it (instead of 'What's happening / Find people to connect with!')", /\{FEED_HEADLINE\[0\]\}[\s\S]{0,80}\{FEED_HEADLINE\[1\]\}/.test(feed) && /\{FEED_INTRO\}/.test(feed) && !/What&rsquo;s happening|What's happening|Find people to connect with/.test(feed));
  t("intro: the logged-out banner uses the very same text, from one place", /FEED_HEADLINE\[0\]/.test(read("components/Hero.tsx")) && /\{FEED_INTRO\}/.test(read("components/Hero.tsx")) && !/Pickup games, dinners/.test(read("components/Hero.tsx")));
  t("intro: the Swipe tab keeps its own short title", /Discover/.test(feed));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
