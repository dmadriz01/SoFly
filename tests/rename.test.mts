// The SoFly rename: the new name everywhere, the old name nowhere, and the butterfly. `npm run test:unit`.
import fs from "node:fs";
import path from "node:path";
import { BRAND, ICON_VERSION, iconUrl, mixHex } from "../lib/brand.ts";
import { ON_DARK, butterflyMarkup, butterflySvg, iconSvg } from "../lib/butterfly.ts";
import * as email from "../lib/email-templates.ts";
import { buildIcs } from "../lib/ics.ts";
import { SITE_NAME, TAGLINE } from "../lib/site.ts";

let passed = 0;
let failed = 0;
const t = (name: string, cond: boolean, extra = "") => {
  cond ? passed++ : failed++;
  console.log(`${cond ? "ok   " : "FAIL "}${name}${cond ? "" : "  -> " + extra}`);
};
const root = process.cwd();
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");

// ───────── the name ─────────
t("name: the site is called SoFly", SITE_NAME === "SoFly");
t("name: the tagline is place-neutral (SoFly isn't only for the Bay Area any more) and doesn't use the old name", /in your city/.test(TAGLINE) && !/Bay Area/.test(TAGLINE) && !/baymeet/i.test(TAGLINE));

// The old name may only survive in two OLD migration files whose text is history (migration 018
// replaces what they created).
const walk = (dir: string): string[] =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((d) => {
    const rel = path.join(dir, d.name);
    if (d.isDirectory()) return ["node_modules", ".next", ".git"].includes(d.name) ? [] : walk(rel);
    return /\.(ts|tsx|mts|mjs|js|css|sql|md|json|example)$/.test(d.name) && d.name !== "inter-bold.ts" && d.name !== "package-lock.json" ? [rel] : [];
  });
const files = [...walk("app"), ...walk("components"), ...walk("lib"), ...walk("public"), ...walk("supabase"), "README.md", ".env.local.example", "package.json"];
const offenders: string[] = [];
for (const f of files) {
  read(f).split("\n").forEach((line, i) => {
    const allowed = line
      .replace(/raise exception 'You must be 18 or older to use BayMeet';/g, "");
    if (/baymeet|bay meet|bay-meet|bay_meet/i.test(allowed)) offenders.push(`${f}:${i + 1}`);
  });
}
t("name: the old name is nowhere in the source (only two old migration lines remain)", offenders.length === 0, offenders.slice(0, 6).join(", "));
{
  const lines = ["supabase/migrations/005_profiles_and_filters.sql", "supabase/migrations/009_hardening_and_cleanup.sql"].filter((f) => /use BayMeet/.test(read(f)));
  t("name: the old text in old migrations is only that one message, and migration 018 replaces it", lines.length === 2 && /use SoFly/.test(read("supabase/migrations/018_rename_message.sql")) && /use SoFly/.test(read("supabase/schema.sql")) && !/BayMeet/.test(read("supabase/schema.sql")));
  t("name: the 018 migration is safe to run again (create or replace) and keeps the function's settings", /create or replace function private\.require_adult\(\)/.test(read("supabase/migrations/018_rename_message.sql")) && /set search_path = ''/.test(read("supabase/migrations/018_rename_message.sql")));
}
{
  const ics = buildIcs({ id: "abc", title: "Run", start: new Date("2027-01-15T18:00:00Z"), location: "Park, 1 Main", description: "", url: "https://x", cancelled: false });
  t("name: calendar files say SoFly (product id and event ids)", /PRODID:-\/\/SoFly\/\/Meetups\/\/EN/.test(ics) && /UID:abc@sofly/.test(ics), ics.slice(0, 200));
  t("name: the downloaded calendar file is named sofly-...", /filename="sofly-\$\{slug\}\.ics"/.test(read("app/events/[id]/calendar.ics/route.ts")));
  t("name: the sender name on emails is SoFly", /from: `SoFly <\$\{mailFrom\(\)\}>`/.test(read("lib/mailer.ts")));
  t("name: notifications default to the title SoFly", /data\.title \|\| "SoFly"/.test(read("public/sw.js")));
  t("name: the app's name on a phone's home screen comes from the same setting", /name: SITE_NAME/.test(read("app/manifest.ts")) && /short_name: SITE_NAME/.test(read("app/manifest.ts")));
  t("name: the package is called sofly", JSON.parse(read("package.json")).name === "sofly");
  const m = email.testEmail({ name: "Ana", siteUrl: "https://s" });
  t("name: emails are signed SoFly (wordmark, footer and subject)", /So<span[^>]*>Fly<\/span>/.test(m.html) && /use SoFly/.test(m.text) && /SoFly/.test(m.subject) && !/Bay/.test(m.html), m.subject);
}

// ───────── the butterfly ─────────
const ALLOWED_TAGS = new Set(["svg", "g", "path", "circle", "rect"]);
const ALLOWED_ATTRS = new Set(["xmlns", "viewBox", "aria-hidden", "focusable", "d", "fill", "stroke", "stroke-width", "stroke-linecap", "cx", "cy", "r", "opacity", "x", "y", "width", "height", "rx", "transform"]);
const problems = (markup: string) => {
  const bad: string[] = [];
  for (const m of markup.matchAll(/<\/?([a-zA-Z]+)([^>]*)>/g)) {
    if (!ALLOWED_TAGS.has(m[1])) bad.push(`tag ${m[1]}`);
    for (const a of m[2].matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)) {
      if (!ALLOWED_ATTRS.has(a[1])) bad.push(`attr ${a[1]}`);
      if (!/^[#A-Za-z0-9 .,()\-:/_]*$/.test(a[2]) || /script|javascript|data:/i.test(a[2])) bad.push(`value ${a[2].slice(0, 30)}`);
    }
  }
  if (/NaN|undefined|null|Infinity/.test(markup)) bad.push("bad number");
  const opens = (markup.match(/<(svg|g)\b/g) ?? []).length, closes = (markup.match(/<\/(svg|g)>/g) ?? []).length;
  if (opens !== closes) bad.push("unbalanced");
  return bad;
};
{
  for (const [name, svg] of [["icon", iconSvg()], ["bare butterfly", butterflySvg(ON_DARK)]] as const) t(`butterfly: the ${name} is well-formed SVG with only known tags, attributes and plain values`, svg.startsWith("<svg") && svg.endsWith("</svg>") && problems(svg).length === 0, problems(svg).join("; "));
  t("butterfly: it is drawn the same every time", iconSvg() === iconSvg());
  const m = butterflyMarkup(ON_DARK);
  t("butterfly: two mirrored sides and a body (symmetric)", (m.match(/<g/g) ?? []).length === 2 && /transform="translate\(100 0\) scale\(-1 1\)"/.test(m) && /<rect x="47\.2"[^>]*width="5\.6"/.test(m) && 47.2 + 5.6 / 2 === 50);
  const colours = new Set([...iconSvg().matchAll(/#[0-9a-f]{6}/gi)].map((c) => c[0].toLowerCase()));
  const palette = new Set([BRAND.accent, BRAND.accentDark, BRAND.gold, BRAND.sand, BRAND.ink, mixHex(BRAND.gold, "#ffffff", 0.3)].map((c) => c.toLowerCase()));
  t("butterfly: it uses only palette colours (or a lighter gold made from the gold)", [...colours].every((c) => palette.has(c)), [...colours].filter((c) => !palette.has(c)).join());
  t("butterfly: the icon is on the deep-green tile; the bare butterfly has no background", iconSvg().includes(`<rect width="100" height="100" fill="${BRAND.accentDark}"/>`) && !butterflySvg(ON_DARK).includes('width="100" height="100"'));
  // an app icon may be cropped to a circle or squircle: keep everything inside the middle 80%
  const tile = iconSvg().match(/translate\((\d+) (\d+)\) scale\(([\d.]+)\)/)!;
  const [off, scale] = [Number(tile[1]), Number(tile[3])];
  t("butterfly: on the icon it stays inside the safe middle 80% (so rounded or circular crops don't cut it)", off >= 10 && off + scale * 100 <= 90, `${off}..${off + scale * 100}`);
  t("butterfly: the wings stand out from the icon background (contrast 3:1+)", (() => { const lum = (h: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }; const c = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05); return c(ON_DARK.upper, BRAND.accentDark) >= 3 && c(ON_DARK.lower, BRAND.accentDark) >= 3; })());
  t("butterfly: the bigger function signatures take colours, never free text", /export function butterflySvg\(colors: ButterflyColors, tile\?: \{ background: string \}\)/.test(read("lib/butterfly.ts")));
}

// ───────── where it shows ─────────
{
  const og = read("lib/og.tsx");
  t("icon: the app icon is the butterfly (no letter B any more)", /iconSvg\(\)/.test(og) && !/>\s*B\s*</.test(og) && !/fontSize: size \* 0\.68/.test(og));
  t("wordmark: link previews show the app icon with 'So' + 'Fly'", /iconSvg\(\)/.test(og) && !/logoSvg/.test(og) && />So<\/span>/.test(og) && />Fly<\/span>/.test(og) && !/>Bay<|>Meet</.test(og));
  const layout = read("app/layout.tsx");
  t("header: every page shows the butterfly logo, linking home", /<Link href="\/"[^>]*>\s*\n\s*<Logo \/>/.test(layout) && /import \{ Logo \}/.test(layout));
  const logo = read("components/Logo.tsx");
  t("header: the logo is the app icon itself (same tile and colours) plus 'So' and 'Fly' in two colours, and the picture is hidden from screen readers", /iconSvg\(\)/.test(logo) && !/logoSvg/.test(logo) && /rounded-\[22%\]/.test(logo) && /So<span className="text-accent">Fly<\/span>/.test(logo) && /aria-hidden/.test(logo));
  t("icons: the icon changed shape, so its web address version changed too (phones and browsers cache icons for a year)", ICON_VERSION.endsWith("-2") && iconUrl(180).includes("?v=" + ICON_VERSION) && read("public/sw.js").includes(iconUrl(192)));
  t("icons: the favicon, home-screen and manifest icons all come from the one icon route", /iconUrl\(64\)/.test(layout) && /iconUrl\(180\)/.test(layout) && /iconUrl\(192\)/.test(read("app/manifest.ts")) && /BrandMark/.test(read("app/pwa-icon/[size]/route.tsx")));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
