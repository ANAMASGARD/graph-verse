import type { AdapterAssignment, AdapterFile, FileRole, FrameworkAdapter } from "../adapters.mts";
import { genericAssignment } from "./generic.mts";
import { importedSpecifiers, parseSource } from "./source.mts";

// Express has no file-based routes. Generators and tutorials share a folder
// habit, and repositories spell those folders both ways. The folder nearest
// the file wins, so routes/v1/middleware/auth.js is Middleware. A route pattern
// is assembled at runtime from the routers and paths it is mounted on, so none
// is emitted.

const FOLDER_ROLES = new Map<string, string>([
  ["route", "Routers"],
  ["routes", "Routers"],
  ["router", "Routers"],
  ["routers", "Routers"],
  ["controller", "Controllers"],
  ["controllers", "Controllers"],
  ["service", "Services"],
  ["services", "Services"],
  ["model", "Models"],
  ["models", "Models"],
  ["middleware", "Middleware"],
  ["middlewares", "Middleware"],
]);

function folderRole(filePath: string): string | null {
  const slash = filePath.lastIndexOf("/");
  const folders = slash === -1 ? [] : filePath.slice(0, slash).split("/");
  for (let index = folders.length - 1; index >= 0; index -= 1) {
    const role = FOLDER_ROLES.get(folders[index] ?? "");
    if (role !== undefined) return role;
  }
  return null;
}

function referencesExpress(source: string, filePath: string): boolean {
  return importedSpecifiers(parseSource(filePath, source)).some(
    (specifier) => specifier === "express" || specifier.startsWith("express/"),
  );
}

export const expressAdapter: FrameworkAdapter = {
  id: "express",
  applies(files) {
    return files.some((file) => referencesExpress(file.source, file.path));
  },
  assign(files): AdapterAssignment {
    const roles: FileRole[] = files.map((file) => {
      const role = folderRole(file.path);
      if (role === null) return genericAssignment(file.path);
      return { path: file.path, role, roleSource: "express" };
    });
    return { framework: "Express", roles, routes: [] };
  },
};
