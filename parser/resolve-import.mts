import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";

import { compilerOptionsFor } from "./compiler-options.mts";
import { isSourcePath, repoRelative, SOURCE_EXTENSIONS } from "./paths.mts";
import type { ExcludedDirectory, ImportOutcome } from "./types.mts";

export interface ResolveContext {
  root: string;
  parsed: ReadonlySet<string>;
  skipped: ReadonlyMap<string, string>;
  excludedDirectories: readonly ExcludedDirectory[];
}

export interface Resolution {
  outcome: ImportOutcome;
  target: string | null;
  reason: string | null;
}

const caches = new Map<ts.CompilerOptions, ts.ModuleResolutionCache>();

const JS_SUBSTITUTIONS: Readonly<Record<string, readonly string[]>> = {
  ".js": [".ts", ".tsx", ".mts", ".d.ts", ".js"],
  ".jsx": [".tsx", ".d.ts", ".jsx"],
  ".mjs": [".mts", ".mjs"],
  ".cjs": [".cts", ".cjs"],
};

function resolutionCache(root: string, options: ts.CompilerOptions): ts.ModuleResolutionCache {
  const existing = caches.get(options);
  if (existing) return existing;
  const created = ts.createModuleResolutionCache(root, (value) => value, options);
  caches.set(options, created);
  return created;
}

export function clearResolutionCache(): void {
  caches.clear();
}

function isPathSpecifier(specifier: string): boolean {
  return (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    path.isAbsolute(specifier)
  );
}

function matchesPaths(specifier: string, options: ts.CompilerOptions): boolean {
  const paths = options.paths;
  if (!paths) return false;
  for (const pattern of Object.keys(paths)) {
    const star = pattern.indexOf("*");
    if (star === -1) {
      if (specifier === pattern) return true;
      continue;
    }
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (
      specifier.startsWith(prefix) &&
      specifier.endsWith(suffix) &&
      specifier.length >= prefix.length + suffix.length
    ) {
      return true;
    }
  }
  return false;
}

function isFile(absolute: string): boolean {
  try {
    return fs.statSync(absolute).isFile();
  } catch {
    return false;
  }
}

function excludedDirectory(
  repoPath: string,
  directories: readonly ExcludedDirectory[],
): ExcludedDirectory | null {
  let match: ExcludedDirectory | null = null;
  for (const directory of directories) {
    if (repoPath !== directory.path && !repoPath.startsWith(`${directory.path}/`)) continue;
    if (match === null || directory.path.length > match.path.length) match = directory;
  }
  return match;
}

function displayPath(root: string, absolute: string): string {
  return repoRelative(root, absolute) ?? "outside the repository";
}

function candidateFiles(fromAbsolute: string, specifier: string): string[] {
  const base = path.isAbsolute(specifier)
    ? path.normalize(specifier)
    : path.resolve(path.dirname(fromAbsolute), specifier);
  const extension = path.extname(specifier);
  const substitutions = JS_SUBSTITUTIONS[extension];
  if (substitutions) {
    const stem = base.slice(0, -extension.length);
    return substitutions.map((next) => `${stem}${next}`);
  }
  if (extension !== "") return [base];
  const files = SOURCE_EXTENSIONS.map((ext) => `${base}${ext}`);
  const indexes = SOURCE_EXTENSIONS.map((ext) => path.join(base, `index${ext}`));
  return [...files, ...indexes];
}

function classifyExisting(absolute: string, context: ResolveContext): Resolution {
  const normalized = path.resolve(absolute);
  const repoPath = repoRelative(context.root, normalized);
  if (repoPath === null) {
    return {
      outcome: "external",
      target: null,
      reason: "resolves outside the repository",
    };
  }
  if (repoPath.split("/").includes("node_modules")) {
    return {
      outcome: "external",
      target: null,
      reason: "resolves to a third-party module",
    };
  }
  if (context.parsed.has(repoPath)) {
    return { outcome: "resolved", target: repoPath, reason: null };
  }
  const excluded = excludedDirectory(repoPath, context.excludedDirectories);
  if (excluded) {
    return {
      outcome: "excluded",
      target: repoPath,
      reason: `target is inside an excluded directory (${excluded.path}): ${excluded.reason}`,
    };
  }
  const skipReason = context.skipped.get(repoPath);
  if (skipReason !== undefined) {
    return {
      outcome: "excluded",
      target: repoPath,
      reason: `target was excluded: ${skipReason}`,
    };
  }
  if (isSourcePath(normalized)) {
    throw new Error(`resolved source file was not walked: ${repoPath}`);
  }
  return {
    outcome: "excluded",
    target: repoPath,
    reason: "target is not a javascript or typescript module",
  };
}

function resolvePathSpecifier(
  fromAbsolute: string,
  specifier: string,
  context: ResolveContext,
): Resolution {
  const candidates = candidateFiles(fromAbsolute, specifier);
  for (const candidate of candidates) {
    if (!isFile(candidate)) continue;
    return classifyExisting(candidate, context);
  }
  const base = path.isAbsolute(specifier)
    ? path.normalize(specifier)
    : path.resolve(path.dirname(fromAbsolute), specifier);
  if (repoRelative(context.root, base) === null) {
    return {
      outcome: "unresolved",
      target: null,
      reason: "module not found; path leaves the repository",
    };
  }
  const tried = candidates.map((candidate) => displayPath(context.root, candidate));
  return {
    outcome: "unresolved",
    target: null,
    reason: `module not found; tried ${tried.join(", ")}`,
  };
}

export function resolveSpecifier(
  fromAbsolute: string,
  specifier: string,
  context: ResolveContext,
): Resolution {
  if (specifier.includes("?") || (isPathSpecifier(specifier) && specifier.includes("#"))) {
    return {
      outcome: "unresolved",
      target: null,
      reason: "specifier contains a query or hash and was not resolved",
    };
  }
  if (specifier.startsWith("node:")) {
    return { outcome: "external", target: null, reason: "node builtin" };
  }
  if (
    specifier.startsWith("https:") ||
    specifier.startsWith("http:") ||
    specifier.startsWith("data:")
  ) {
    return {
      outcome: "external",
      target: null,
      reason: "url specifier points outside the repository",
    };
  }

  const options = compilerOptionsFor(fromAbsolute, context.root);
  const resolved = ts.resolveModuleName(
    specifier,
    fromAbsolute,
    options,
    ts.sys,
    resolutionCache(context.root, options),
  );
  if (resolved.resolvedModule) {
    return classifyExisting(resolved.resolvedModule.resolvedFileName, context);
  }
  if (isPathSpecifier(specifier)) return resolvePathSpecifier(fromAbsolute, specifier, context);
  if (matchesPaths(specifier, options)) {
    return {
      outcome: "unresolved",
      target: null,
      reason: "path alias did not match a file",
    };
  }
  if (specifier.startsWith("#")) {
    return {
      outcome: "unresolved",
      target: null,
      reason: "package import was not resolved",
    };
  }
  return {
    outcome: "external",
    target: null,
    reason: "bare specifier points outside the repository",
  };
}
