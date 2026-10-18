import fs from "node:fs";
import path from "node:path";

import { matchGitignore, parseGitignore, type GitignorePattern } from "./gitignore.mts";
import { folderOf, isSourcePath, repoRelative } from "./paths.mts";
import type { ExcludedDirectory, SkippedFile } from "./types.mts";

// Whole directories, not a sample of the largest files. Dependency installs
// and the version-control store are never source. Everything else the
// repository's .gitignore names is excluded with that reason, so generated
// output is dropped because the repo said so, not because of a framework name.

const HARD_EXCLUDED = new Map<string, string>([
  ["node_modules", "third-party dependencies"],
  [".git", "version control metadata"],
]);

export interface SourcePath {
  path: string;
  absolute: string;
}

export interface WalkResult {
  source: SourcePath[];
  skipped: SkippedFile[];
  excludedDirectories: ExcludedDirectory[];
}

function extensionDetail(filePath: string): string {
  const extension = path.extname(filePath);
  return extension === "" ? "no extension" : `extension ${extension}`;
}

function readGitignore(directory: string, root: string): GitignorePattern[] {
  const file = path.join(directory, ".gitignore");
  if (!fs.existsSync(file)) return [];
  const relative = repoRelative(root, directory);
  const base = relative === null || relative === "." ? "" : relative;
  return parseGitignore(fs.readFileSync(file, "utf8"), base);
}

export function walkRepository(root: string): WalkResult {
  const source: SourcePath[] = [];
  const skipped: SkippedFile[] = [];
  const excludedDirectories: ExcludedDirectory[] = [];

  const visit = (directory: string, patterns: readonly GitignorePattern[]): void => {
    const localPatterns = patterns.concat(readGitignore(directory, root));
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = repoRelative(root, absolute);
      if (relative === null) {
        throw new Error(`walk left the repository at ${absolute}`);
      }

      if (entry.isDirectory()) {
        const hardReason = HARD_EXCLUDED.get(entry.name);
        if (hardReason !== undefined) {
          excludedDirectories.push({
            path: relative,
            reason: hardReason,
            detail: `directory name ${entry.name}`,
          });
          continue;
        }
        const ignored = matchGitignore(relative, true, localPatterns);
        if (ignored.ignored) {
          excludedDirectories.push({
            path: relative,
            reason: "ignored by .gitignore",
            detail: ignored.pattern ?? "gitignore",
          });
          continue;
        }
        visit(absolute, localPatterns);
        continue;
      }

      if (entry.isSymbolicLink()) {
        classifySymlink(absolute, relative, localPatterns, source, skipped, excludedDirectories, root);
        continue;
      }

      if (!entry.isFile()) continue;
      classifyFile(absolute, relative, localPatterns, source, skipped);
    }
  };

  visit(root, []);
  source.sort((left, right) => left.path.localeCompare(right.path));
  skipped.sort((left, right) => left.path.localeCompare(right.path));
  excludedDirectories.sort((left, right) => left.path.localeCompare(right.path));
  return { source, skipped, excludedDirectories };
}

function classifySymlink(
  absolute: string,
  relative: string,
  patterns: readonly GitignorePattern[],
  source: SourcePath[],
  skipped: SkippedFile[],
  excludedDirectories: ExcludedDirectory[],
  root: string,
): void {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(absolute);
  } catch (error) {
    skipped.push(skip(relative, "unreadable", errorMessage(error)));
    return;
  }
  const real = fs.realpathSync(absolute);
  if (repoRelative(root, real) === null) {
    skipped.push(skip(relative, "symbolic link points outside the repository", real));
    return;
  }
  if (stat.isDirectory()) {
    excludedDirectories.push({
      path: relative,
      reason: "symbolic link to a directory",
      detail: real,
    });
    return;
  }
  classifyFile(absolute, relative, patterns, source, skipped);
}

function classifyFile(
  absolute: string,
  relative: string,
  patterns: readonly GitignorePattern[],
  source: SourcePath[],
  skipped: SkippedFile[],
): void {
  const ignored = matchGitignore(relative, false, patterns);
  if (ignored.ignored) {
    skipped.push(skip(relative, "ignored by .gitignore", ignored.pattern ?? "gitignore"));
    return;
  }
  if (!isSourcePath(relative)) {
    skipped.push(skip(relative, "not a javascript or typescript module", extensionDetail(relative)));
    return;
  }
  source.push({ path: relative, absolute });
}

function skip(filePath: string, reason: string, detail: string): SkippedFile {
  return {
    path: filePath,
    folder: folderOf(filePath),
    reason,
    detail,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
