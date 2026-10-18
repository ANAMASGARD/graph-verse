import { existsSync } from "node:fs";
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const empty = new URL("./server-only-empty.mjs", import.meta.url).href;
const EXTENSIONS = [".ts", ".mts", ".tsx", ".js", ".mjs"];

// Plain Node does not resolve the app's extensionless TypeScript imports, and
// `server-only` throws outside a server component. Eval scripts import those
// modules, so both are handled here.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: empty, shortCircuit: true };
    }
    const resolved = resolveExtension(specifier, context.parentURL);
    if (resolved !== null) return { url: resolved, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

function resolveExtension(specifier, parentURL) {
  if (!parentURL || !specifier.startsWith(".")) return null;
  if (EXTENSIONS.some((ext) => specifier.endsWith(ext))) return null;
  const base = path.resolve(path.dirname(fileURLToPath(parentURL)), specifier);
  for (const ext of EXTENSIONS) {
    if (existsSync(base + ext)) return pathToFileURL(base + ext).href;
  }
  return null;
}
