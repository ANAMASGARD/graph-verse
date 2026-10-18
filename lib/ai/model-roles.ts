// Roles the model may assign when no adapter identified the file. None of these
// is routable — convention owns pages, routes, and controllers.

export const MODEL_ROLES = ["service", "repository", "model", "util", "config", "component", "hook"] as const;

export type ModelRole = (typeof MODEL_ROLES)[number];

export function isModelRole(value: string): value is ModelRole {
  return (MODEL_ROLES as readonly string[]).includes(value);
}

export function modelRoleLabel(role: ModelRole): string {
  return role;
}
