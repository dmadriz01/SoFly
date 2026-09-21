import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import { BRAND, BRAND_DARK, THEME_TOKENS, kebab, rgbTriplet } from "./lib/brand";

// Every colour the screens use is a CSS variable (defined below from lib/brand.ts, light and dark),
// so a class like `bg-surface` or `text-ink/80` follows the theme with no `dark:` prefix needed.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const vars = (palette: Record<string, string>) =>
  Object.fromEntries(THEME_TOKENS.map((t) => [`--${kebab(t)}`, rgbTriplet(palette[t])]));

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  // `dark:` applies in dark mode: when the system is dark (unless the person chose Light), or when they chose Dark.
  darkMode: [
    "variant",
    ["@media (prefers-color-scheme: dark) { &:not([data-theme='light'] *) }", "&:is([data-theme='dark'] *)"],
  ],
  theme: {
    extend: {
      colors: {
        cream: v("cream"),
        surface: v("surface"),
        sand: BRAND.sand,
        gold: BRAND.gold,
        ink: v("ink"),
        muted: v("muted"),
        line: v("line"),
        "on-accent": v("on-accent"),
        accent: { DEFAULT: v("accent"), dark: v("accent-dark"), soft: v("accent-soft") },
        danger: { DEFAULT: v("danger"), strong: v("danger-strong"), soft: v("danger-soft"), line: v("danger-line") },
        warn: { strong: v("warn-strong"), soft: v("warn-soft"), line: v("warn-line") },
      },
      fontFamily: {
        sans: [
          "ui-rounded",
          '"SF Pro Rounded"',
          "system-ui",
          "-apple-system",
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ":root": { ...vars(BRAND), colorScheme: "light" },
        // Dark when the system is dark, unless the person picked Light...
        "@media (prefers-color-scheme: dark)": { ":root:not([data-theme='light'])": { ...vars(BRAND_DARK), colorScheme: "dark" } },
        // ...or when they picked Dark.
        ":root[data-theme='dark']": { ...vars(BRAND_DARK), colorScheme: "dark" },
      });
    }),
  ],
};

export default config;
