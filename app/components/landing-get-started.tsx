"use client";

import { Show, SignUpButton } from "@clerk/nextjs";
import Link from "next/link";
import { signUpModalRedirectProps } from "@/lib/auth-redirect-props";
import { DASHBOARD_PATH } from "@/lib/auth-routes";

const ctaClassName = "brutal-pill brutal-pill-signup brutal-pill-cta";

export function LandingGetStarted() {
  return (
    <>
      <Show when="signed-out">
        <SignUpButton mode="modal" {...signUpModalRedirectProps}>
          <button type="button" className={ctaClassName} id="get-started">
            Get Started
          </button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <Link href={DASHBOARD_PATH} className={ctaClassName} id="get-started">
          Get Started
        </Link>
      </Show>
    </>
  );
}
