import path from "node:path";

export const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".d.ts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
] as const;

const SOURCE_EXTENSION_SET = new Set<string>(SOURCE_EXTENSIONS);

const MODULE_EXTENSION =
  /\.(?:d\.ts|tsx|mts|cts|jsx|mjs|cjs|ts|js)$/;

export function isSourcePath(filePath: string): boolean {
  if (filePath.endsWith(".d.ts")) return true;
  return SOURCE_EXTENSION_SET.has(path.extname(filePath));
}

export function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

/** Repo-relative posix path, or null when `absolute` is outside `root`. */
export function repoRelative(root: string, absolute: string): string | null {
  const relative = path.relative(root, absolute);
  if (relative === "") return ".";
  if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    return null;
  }
  return toPosix(relative);
}

export function folderOf(repoPath: string): string {
  const index = repoPath.lastIndexOf("/");
  return index === -1 ? "." : repoPath.slice(0, index);
}

/**
 * Module identity other files use: the repo path without its extension.
 * `index` files collapse to the directory, because that is how they are imported.
 */
export function moduleIdOf(repoPath: string): string {
  const without = repoPath.replace(MODULE_EXTENSION, "");
  if (without === "index") return ".";
  if (without.endsWith("/index")) return without.slice(0, -"/index".length);
  return without;
}

export function countLines(content: string): number {
  if (content.length === 0) return 0;
  let newlines = 0;
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") newlines += 1;
  }
  return content.endsWith("\n") ? newlines : newlines + 1;
}
