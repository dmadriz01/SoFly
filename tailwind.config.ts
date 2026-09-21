import type { Config } from "tailwindcss";
import { BRAND } from "./lib/brand";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: BRAND.cream,
        sand: BRAND.sand,
        gold: BRAND.gold,
        ink: BRAND.ink,
        muted: BRAND.muted,
        line: BRAND.line,
        accent: {
          DEFAULT: BRAND.accent,
          dark: BRAND.accentDark,
          soft: BRAND.accentSoft,
        },
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
  plugins: [],
};

export default config;
