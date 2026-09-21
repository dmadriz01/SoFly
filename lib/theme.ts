// Light / dark / follow-the-phone. The choice lives in a cookie, so the server can put the right
// theme in the very first HTML (no flash of the wrong colours). With no cookie the screens follow
// the device's own setting (prefers-color-scheme) through CSS alone.

export const THEME_COOKIE = "sofly_theme";
export type ThemeChoice = "system" | "light" | "dark";
export const THEME_CHOICES: readonly ThemeChoice[] = ["system", "light", "dark"];

/** What to put on <html data-theme>: "light" or "dark" if the person chose, or undefined to follow the device. */
export function readTheme(value: string | null | undefined): "light" | "dark" | undefined {
  return value === "light" || value === "dark" ? value : undefined;
}

/** The cookie text for a choice. "System" removes the cookie, so the device decides again. */
export function themeCookie(choice: ThemeChoice): string {
  return choice === "system"
    ? `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`
    : `${THEME_COOKIE}=${choice}; path=/; max-age=31536000; samesite=lax`;
}

/** Switches the page right now and remembers the choice. (Browser only.) */
export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    document.cookie = themeCookie(choice);
  } catch {
    // Cookies blocked: it still switches now, it just won't be remembered.
  }
}

/** Which choice is in effect on the page right now. (Browser only.) */
export function currentTheme(): ThemeChoice {
  return readTheme(document.documentElement.dataset.theme) ?? "system";
}
