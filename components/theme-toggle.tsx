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
  { value: "system", label: "system" },
  { value: "light", label: "light" },
  { value: "dark", label: "dark" },
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
      className="brutal-surface inline-flex gap-0.5 p-1 shadow-none"
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
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold lowercase transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
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
