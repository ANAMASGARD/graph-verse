import type { ModelRole } from "../lib/ai/model-roles.ts";

// Convention roles the classifier is allowed to return. Pages, routes, and
// controllers are left out: the model is forbidden to say them, so scoring
// those files would measure a question it cannot answer.

const CONVENTIONAL_TO_MODEL: { [role: string]: ModelRole } = {
  Components: "component",
  Hooks: "hook",
  Config: "config",
  Services: "service",
  Models: "model",
};

export function heldOutRole(conventional: string): ModelRole | null {
  return CONVENTIONAL_TO_MODEL[conventional] ?? null;
}
