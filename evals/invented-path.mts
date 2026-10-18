// A path-shaped token is either one of the paths handed to the model, or it
// was invented. Membership is the whole check. A model does not grade it.

const SOURCE_EXT = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts", "json"]);

export type PathCheck = {
  tokens: string[];
  invented: string[];
  /** 1 when nothing path-shaped fell outside the set the model was shown. */
  score: 0 | 1;
};

export function checkInventedPaths(text: string, shown: readonly string[]): PathCheck {
  const allowed = new Set(shown.map(normalizePathToken).filter((token): token is string => token !== null));
  const tokens = pathTokens(text);
  const invented = tokens.filter((token) => !allowed.has(token));
  return { tokens, invented, score: invented.length === 0 ? 1 : 0 };
}

export function pathsShownFromUnknown(value: unknown): string[] | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as { [key: string]: unknown };
  if (typeof record.path === "string" && Array.isArray(record.imports) && Array.isArray(record.importedBy)) {
    return unique([record.path, ...pathsOf(record.imports), ...pathsOf(record.importedBy)]);
  }
  if (typeof record.dir === "string" && Array.isArray(record.files)) {
    const paths = record.dir === "." ? [] : [record.dir];
    paths.push(...pathsOf(record.files));
    paths.push(...edgePaths(record.incoming), ...edgePaths(record.outgoing));
    return unique(paths);
  }
  return null;
}

export function pathTokens(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const token = normalizePathToken(raw);
    if (token === null || seen.has(token)) return;
    seen.add(token);
    found.push(token);
  };
  for (const match of text.matchAll(/`([^`\n]+)`/g)) add(match[1] ?? "");
  const prose = text.replace(/`[^`\n]*`/g, " ");
  for (const match of prose.matchAll(/(?:^|[^\w./@-])((?:[\w.@-]+\/)+[\w.@-]+\.[A-Za-z0-9]+)/g)) {
    add(match[1] ?? "");
  }
  for (const match of prose.matchAll(/(?:^|[^\w./@-])([\w.@-]+\.(?:tsx?|jsx?|mjs|cjs|mts|cts|json))\b/g)) {
    add(match[1] ?? "");
  }
  return found;
}

function normalizePathToken(raw: string): string | null {
  let token = raw.trim().replaceAll("\\", "/");
  token = token.replace(/^[("'`[]+/, "").replace(/[)"'\].,;:!?]+$/, "");
  if (token.startsWith("./")) token = token.slice(2);
  if (token.endsWith("/")) token = token.slice(0, -1);
  if (!token || token.includes("://") || /\s/.test(token)) return null;
  const dot = token.lastIndexOf(".");
  const ext = dot === -1 ? "" : token.slice(dot + 1).toLowerCase();
  if (!SOURCE_EXT.has(ext)) return null;
  return token;
}

function pathsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const paths: string[] = [];
  for (const entry of value) {
    if (entry !== null && typeof entry === "object" && "path" in entry && typeof entry.path === "string") {
      paths.push(entry.path);
    }
  }
  return paths;
}

function edgePaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const paths: string[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object") continue;
    if ("from" in entry && typeof entry.from === "string") paths.push(entry.from);
    if ("to" in entry && typeof entry.to === "string") paths.push(entry.to);
  }
  return paths;
}

function unique(paths: readonly string[]): string[] {
  return [...new Set(paths)];
}
