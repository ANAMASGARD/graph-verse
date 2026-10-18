import { AppShell } from "@/components/app-shell";
import { cookies } from "next/headers";
import { parseThemePreference, THEME_COOKIE } from "@/lib/theme";
import { Figtree, IBM_Plex_Mono, Syne } from "next/font/google";
import "../workspace.css";

const workspaceDisplay = Syne({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-workspace-display",
  display: "swap",
});

const workspaceSans = Figtree({
  subsets: ["latin"],
  variable: "--font-workspace-sans",
  display: "swap",
});

const workspaceMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-workspace-mono",
  display: "swap",
});

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const theme = parseThemePreference(cookieStore.get(THEME_COOKIE)?.value);

  return (
    <div
      className={`workspace-root ${workspaceDisplay.variable} ${workspaceSans.variable} ${workspaceMono.variable}`}
    >
      <AppShell theme={theme}>{children}</AppShell>
    </div>
  );
}
