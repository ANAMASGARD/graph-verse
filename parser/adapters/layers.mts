// Shared by the React adapter and Next, which is a React app plus its own
// route files. Directory names only — a file called useThing.ts outside
// hooks/ is not assumed to be a hook.

export function layerRole(filePath: string): "Components" | "Hooks" | null {
  const slash = filePath.lastIndexOf("/");
  const dirs = slash === -1 ? [] : filePath.slice(0, slash).split("/");
  if (dirs.includes("hooks")) return "Hooks";
  if (dirs.includes("components") || dirs.includes("component")) return "Components";
  return null;
}
