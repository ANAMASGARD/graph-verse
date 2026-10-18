export type ThemePreference = "system" | "light" | "dark";

export const THEME_COOKIE = "gv-theme";

const THEME_VALUES: readonly ThemePreference[] = ["system", "light", "dark"];

export function parseThemePreference(value: string | undefined): ThemePreference {
  if (value && (THEME_VALUES as readonly string[]).includes(value)) {
    return value as ThemePreference;
  }
  return "system";
}

/** Class applied on the server when the preference is unambiguous. */
export function themeClassFromPreference(theme: ThemePreference): string {
  if (theme === "dark") {
    return "dark";
  }
  return "";
}

export function applyThemeToDocument(theme: ThemePreference): void {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
    return;
  }
  if (theme === "light") {
    root.classList.remove("dark");
    return;
  }
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}
