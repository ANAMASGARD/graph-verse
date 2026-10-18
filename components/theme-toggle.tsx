"use client";

import { setThemePreference } from "@/app/actions/set-theme";
import {
  applyThemeToDocument,
  type ThemePreference,
} from "@/lib/theme";
import { useRouter } from "next/navigation";

type ThemeToggleProps = {
  current: ThemePreference;
};

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function ThemeToggle({ current }: ThemeToggleProps) {
  const router = useRouter();

  async function select(theme: ThemePreference) {
    applyThemeToDocument(theme);
    await setThemePreference(theme);
    router.refresh();
  }

  return (
    <div
      className="inline-flex border-2 border-border bg-card p-0.5 shadow-xs"
      role="group"
      aria-label="Theme"
    >
      {OPTIONS.map(({ value, label }) => {
        const active = current === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => select(value)}
            aria-pressed={active}
            className={`px-2 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors ${
              active
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
