import { AppShell } from "@/components/app-shell";
import { cookies } from "next/headers";
import { parseThemePreference, THEME_COOKIE } from "@/lib/theme";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const theme = parseThemePreference(cookieStore.get(THEME_COOKIE)?.value);

  return <AppShell theme={theme}>{children}</AppShell>;
}
