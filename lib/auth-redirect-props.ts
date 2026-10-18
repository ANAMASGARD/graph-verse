import { DASHBOARD_PATH } from "@/lib/auth-routes";

/** Passed to `<SignInButton mode="modal" />`. */
export const signInModalRedirectProps = {
  forceRedirectUrl: DASHBOARD_PATH,
  fallbackRedirectUrl: DASHBOARD_PATH,
  signUpForceRedirectUrl: DASHBOARD_PATH,
  signUpFallbackRedirectUrl: DASHBOARD_PATH,
} as const;

/** Passed to `<SignUpButton mode="modal" />`. */
export const signUpModalRedirectProps = {
  forceRedirectUrl: DASHBOARD_PATH,
  fallbackRedirectUrl: DASHBOARD_PATH,
  signInForceRedirectUrl: DASHBOARD_PATH,
  signInFallbackRedirectUrl: DASHBOARD_PATH,
} as const;
