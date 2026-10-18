import type { AdapterAssignment, AdapterFile, FileRole, FrameworkAdapter } from "../adapters.mts";
import { genericAssignment } from "./generic.mts";
import { layerRole } from "./layers.mts";
import { importedSpecifiers, parseSource } from "./source.mts";

// React has no file-based routes. The component and hook directories are the
// same ones Next uses, so this adapter is that classification and nothing else.

function importsReact(source: string, filePath: string): boolean {
  return importedSpecifiers(parseSource(filePath, source)).some(
    (specifier) => specifier === "react" || specifier === "react-dom" || specifier.startsWith("react/"),
  );
}

export const reactAdapter: FrameworkAdapter = {
  id: "react",
  applies(files) {
    return files.some((file) => importsReact(file.source, file.path));
  },
  assign(files): AdapterAssignment {
    const roles: FileRole[] = files.map((file) => {
      const layer = layerRole(file.path);
      if (layer === null) return genericAssignment(file.path);
      return { path: file.path, role: layer, roleSource: "react" };
    });
    return { framework: "React", roles, routes: [] };
  },
};
