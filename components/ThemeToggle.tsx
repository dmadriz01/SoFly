"use client";

import { useEffect, useState } from "react";
import { applyTheme, currentTheme, type ThemeChoice } from "@/lib/theme";

const icon = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const OPTIONS: { value: ThemeChoice; label: string; icon: React.ReactNode }[] = [
  {
    value: "system",
    label: "Auto",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" {...icon}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 3.5v17" />
        <path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" />
      </svg>
    ),
  },
  {
    value: "light",
    label: "Light",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" {...icon}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" {...icon}>
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
      </svg>
    ),
  },
];

/**
 * Appearance: Auto (follow the phone or computer), Light, or Dark. The choice is remembered in a
 * cookie (see lib/theme.ts). "Auto" is the default and stays in step if the device switches at sunset.
 */
export function ThemeToggle({ size = "md" }: { size?: "sm" | "md" }) {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  useEffect(() => setChoice(currentTheme()), []);

  const pick = (value: ThemeChoice) => {
    setChoice(value);
    applyTheme(value);
  };
  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "tap px-3.5 text-sm";

  return (
    <div role="radiogroup" aria-label="Appearance" className="inline-flex shrink-0 rounded-full bg-line/70 p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={choice === o.value}
          onClick={() => pick(o.value)}
          className={`inline-flex items-center gap-1.5 rounded-full font-semibold transition ${pad} ${
            choice === o.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
