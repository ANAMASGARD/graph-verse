"use server";

import { cookies } from "next/headers";
import { THEME_COOKIE, parseThemePreference, type ThemePreference } from "@/lib/theme";

export async function setThemePreference(next: ThemePreference): Promise<ThemePreference> {
  const theme = parseThemePreference(next);
  const store = await cookies();
  store.set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return theme;
}
