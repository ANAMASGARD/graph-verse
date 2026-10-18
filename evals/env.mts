import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Next loads `.env` and then lets `.env.local` override it, and neither
// overrides a variable the process already had. Scripts are not Next, so
// they call this before touching the model, LangSmith, or FalkorDB.

export function loadAppEnv(root = process.cwd()): void {
  const locked = new Set(Object.keys(process.env));
  applyFile(path.join(root, ".env"), locked);
  applyFile(path.join(root, ".env.local"), locked);
}

function applyFile(file: string, locked: ReadonlySet<string>): void {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const body = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const eq = body.indexOf("=");
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    if (!key || locked.has(key)) continue;
    process.env[key] = unquote(body.slice(eq + 1).trim());
  }
}

function unquote(value: string): string {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }
  return value;
}
