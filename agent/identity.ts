import { defineIdentity } from "managed-deepagents";

// The Next.js app authenticates the person, then calls this process.
// Callers send X-MDA-Ingress-Secret and X-MDA-User-Id. The browser never does.
export const identity = defineIdentity({
  auth: "backend",
});
