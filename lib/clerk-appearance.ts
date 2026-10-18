import { dark, neobrutalism } from "@clerk/ui/themes";

const brutalSocialButton = {
  backgroundColor: "#ffffff",
  background: "#ffffff",
  color: "#050505",
  border: "2px solid #000",
  boxShadow: "3px 3px 0 #000",
  minHeight: "2.75rem",
  transition: "transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease",
  "&:hover": {
    backgroundColor: "#ffdc58",
    background: "#ffdc58",
    boxShadow: "4px 4px 0 #000",
    transform: "translate(-1px, -1px)",
  },
  "&:active": {
    boxShadow: "2px 2px 0 #000",
    transform: "translate(1px, 1px)",
  },
};

const brutalSocialIcon = {
  opacity: 1,
  width: "1.35rem",
  height: "1.35rem",
  filter: "none",
};

/** Clerk renders GitHub via CSS mask + background fill, not an <img>. */
const maskProviderIcon = {
  ...brutalSocialIcon,
  backgroundColor: "#050505",
  backgroundImage: "none",
};

const glassModalBackdrop = {
  backgroundColor: "rgba(5, 5, 5, 0.42)",
  backdropFilter: "blur(16px) saturate(140%)",
  WebkitBackdropFilter: "blur(16px) saturate(140%)",
};

/** Dark neo-brutalist Clerk UI — auth pages and embedded components. */
export const clerkAppearance = {
  theme: [dark, neobrutalism],
  variables: {
    colorPrimary: "#DF1B1B",
  },
  elements: {
    modalBackdrop: glassModalBackdrop,
    modalContent: {
      margin: "auto",
    },
    headerSubtitle: {
      color: "var(--clerk-color-muted, #b3ac9e)",
    },
    socialButtonsIconButton: {
      ...brutalSocialButton,
      flex: "1 1 0",
    },
    socialButtonsBlockButton: {
      ...brutalSocialButton,
      width: "100%",
    },
    socialButtonsProviderIcon: brutalSocialIcon,
    socialButtonsProviderIcon__github: maskProviderIcon,
    socialButtonsProviderIcon__apple: maskProviderIcon,
    socialButtonsProviderIcon__okta: maskProviderIcon,
    socialButtonsProviderIcon__vercel: maskProviderIcon,
    socialButtonsProviderIcon__x: maskProviderIcon,
    socialButtonsIconButton__google: brutalSocialButton,
    socialButtonsIconButton__github: brutalSocialButton,
  },
};
