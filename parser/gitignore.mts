// Directory pruning follows git: an ignored directory is not entered, and a
// negation cannot pull a file back out of an ignored parent. Patterns come
// from the repository's own .gitignore files, not from framework names.

export interface GitignorePattern {
  base: string;
  source: string;
  negation: boolean;
  directoryOnly: boolean;
  anchored: boolean;
  body: string;
  regex: RegExp;
}

export interface IgnoreMatch {
  ignored: boolean;
  pattern: string | null;
}

function escapeRegex(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function globToRegexBody(pattern: string): string {
  let body = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*") {
      const next = pattern[index + 1];
      if (next === "*") {
        const after = pattern[index + 2];
        if (after === "/") {
          body += "(?:.*/)?";
          index += 2;
          continue;
        }
        body += ".*";
        index += 1;
        continue;
      }
      body += "[^/]*";
      continue;
    }
    if (char === "?") {
      body += "[^/]";
      continue;
    }
    if (char === "\\") {
      const escaped = pattern[index + 1];
      if (escaped !== undefined) {
        body += escapeRegex(escaped);
        index += 1;
      }
      continue;
    }
    if (char === "[") {
      const end = pattern.indexOf("]", index + 1);
      if (end !== -1) {
        body += pattern.slice(index, end + 1);
        index = end;
        continue;
      }
    }
    if (char !== undefined) body += escapeRegex(char);
  }
  return body;
}

function compileBody(body: string, anchored: boolean): RegExp {
  const expression = anchored ? `^${globToRegexBody(body)}$` : `^(?:.*/)?${globToRegexBody(body)}$`;
  return new RegExp(expression);
}

function stripTrailingSpace(line: string): string {
  let end = line.length;
  while (end > 0 && (line[end - 1] === " " || line[end - 1] === "\t")) {
    if (end > 1 && line[end - 2] === "\\") break;
    end -= 1;
  }
  return line.slice(0, end);
}

export function parseGitignore(text: string, base: string): GitignorePattern[] {
  const lines = text.split(/\r?\n/);
  const patterns: GitignorePattern[] = [];
  let pending = "";
  for (const raw of lines) {
    let line = pending + raw;
    pending = "";
    if (line.endsWith("\\")) {
      pending = line.slice(0, -1);
      continue;
    }
    line = stripTrailingSpace(line);
    if (line === "" || line.startsWith("#")) continue;
    let negation = false;
    if (line.startsWith("!")) {
      negation = true;
      line = line.slice(1);
    } else if (line.startsWith("\\!") || line.startsWith("\\#")) {
      line = line.slice(1);
    }
    let directoryOnly = false;
    if (line.endsWith("/")) {
      directoryOnly = true;
      line = line.slice(0, -1);
    }
    if (line === "") continue;
    const anchored = line.startsWith("/") || line.includes("/");
    const body = line.startsWith("/") ? line.slice(1) : line;
    const source = `${negation ? "!" : ""}${body}${directoryOnly ? "/" : ""}`;
    patterns.push({
      base,
      source,
      negation,
      directoryOnly,
      anchored,
      body,
      regex: compileBody(body, anchored),
    });
  }
  return patterns;
}

function localPath(pattern: GitignorePattern, repoPath: string): string | null {
  if (pattern.base === "") return repoPath;
  if (repoPath === pattern.base) return null;
  const prefix = `${pattern.base}/`;
  if (!repoPath.startsWith(prefix)) return null;
  return repoPath.slice(prefix.length);
}

function patternMatches(pattern: GitignorePattern, repoPath: string, isDirectory: boolean): boolean {
  if (pattern.directoryOnly && !isDirectory) return false;
  const local = localPath(pattern, repoPath);
  if (local === null || local === "") return false;
  return pattern.regex.test(local);
}

/** Last matching pattern wins, which is git's rule. */
export function matchGitignore(
  repoPath: string,
  isDirectory: boolean,
  patterns: readonly GitignorePattern[],
): IgnoreMatch {
  let ignored = false;
  let pattern: string | null = null;
  for (const candidate of patterns) {
    if (!patternMatches(candidate, repoPath, isDirectory)) continue;
    ignored = !candidate.negation;
    pattern = candidate.negation ? null : candidate.source;
  }
  return { ignored, pattern };
}
