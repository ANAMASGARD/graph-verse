import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { DASHBOARD_PATH } from "@/lib/auth-routes";
import { clerkAppearance } from "@/lib/clerk-appearance";
import type { ThemePreference } from "@/lib/theme";

type AppShellProps = {
  children: React.ReactNode;
  theme: ThemePreference;
};

export function AppShell({ children, theme }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <header className="border-b-2 border-border bg-card shadow-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Link
              href={DASHBOARD_PATH}
              className="font-head text-xs uppercase tracking-wide"
            >
              Graph Verse
            </Link>
            <OrganizationSwitcher
              hidePersonal
              appearance={clerkAppearance}
              afterCreateOrganizationUrl={DASHBOARD_PATH}
              afterSelectOrganizationUrl={DASHBOARD_PATH}
              afterLeaveOrganizationUrl={DASHBOARD_PATH}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle current={theme} />
            <UserButton appearance={clerkAppearance} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
