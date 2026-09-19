import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "#fbf8f3",
        ink: "#2b2622",
        muted: "#7d726a",
        line: "#ebe2d7",
        accent: {
          DEFAULT: "#d9552f",
          dark: "#bd4523",
          soft: "#fcebe4",
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
