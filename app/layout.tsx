import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { DASHBOARD_PATH } from "@/lib/auth-routes";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { themeBootScript } from "@/lib/theme-script";
import {
  parseThemePreference,
  themeClassFromPreference,
  THEME_COOKIE,
} from "@/lib/theme";
import { Archivo_Black, Space_Grotesk } from "next/font/google";
import "./globals.css";

const archivoBlack = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-head",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Next Layer of Intelligence",
  description:
    "A unified infrastructure platform to help teams build, ship, and scale AI systems with confidence.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const theme = parseThemePreference(cookieStore.get(THEME_COOKIE)?.value);
  const themeClass = themeClassFromPreference(theme);

  return (
    <html
      lang="en"
      className={`${archivoBlack.variable} ${spaceGrotesk.variable} h-full antialiased ${themeClass}`.trim()}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background font-sans text-foreground">
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <ClerkProvider
          appearance={clerkAppearance}
          taskUrls={{ "choose-organization": "/session-tasks/choose-organization" }}
          signInFallbackRedirectUrl={DASHBOARD_PATH}
          signUpFallbackRedirectUrl={DASHBOARD_PATH}
          signInForceRedirectUrl={DASHBOARD_PATH}
          signUpForceRedirectUrl={DASHBOARD_PATH}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}