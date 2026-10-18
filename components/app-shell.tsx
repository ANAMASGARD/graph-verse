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
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b-2 border-border bg-card">
        <div className="workspace-container flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Link
              href={DASHBOARD_PATH}
              className="workspace-display text-base font-bold lowercase tracking-tight"
            >
              graph verse
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
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
