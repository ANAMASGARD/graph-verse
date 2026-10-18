"use client";

import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import {
  signInModalRedirectProps,
  signUpModalRedirectProps,
} from "@/lib/auth-redirect-props";
import { clerkAppearance } from "@/lib/clerk-appearance";

type ClerkAuthControlsProps = {
  className?: string;
  variant?: "topbar" | "menu";
};

export function ClerkAuthControls({
  className = "",
  variant = "topbar",
}: ClerkAuthControlsProps) {
  const signedOutClass =
    variant === "menu"
      ? "menu-auth menu-auth-signed-out"
      : "topbar-auth topbar-auth-signed-out";
  const signedInClass =
    variant === "menu"
      ? "menu-auth menu-auth-signed-in"
      : "topbar-auth topbar-auth-signed-in";

  const signInClass =
    variant === "menu"
      ? "brutal-pill brutal-pill-signin brutal-pill-menu"
      : "brutal-pill brutal-pill-signin brutal-pill-nav";
  const signUpClass =
    variant === "menu"
      ? "brutal-pill brutal-pill-signup brutal-pill-menu"
      : "brutal-pill brutal-pill-signup brutal-pill-nav";

  return (
    <div className={`clerk-auth ${className}`.trim()}>
      <Show when="signed-out">
        <div className={signedOutClass}>
          <SignInButton mode="modal" {...signInModalRedirectProps}>
            <button type="button" className={signInClass}>
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="modal" {...signUpModalRedirectProps}>
            <button type="button" className={signUpClass}>
              Sign up
            </button>
          </SignUpButton>
        </div>
      </Show>
      <Show when="signed-in">
        <div className={signedInClass}>
          <UserButton appearance={clerkAppearance} />
        </div>
      </Show>
    </div>
  );
}
