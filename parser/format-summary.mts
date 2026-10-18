import type { EdgeKind, ParseResult } from "./types.mts";

function tally(lines: string[], label: string, count: number): void {
  lines.push(`${label}: ${count}`);
}

export function formatParseSummary(result: ParseResult): string {
  const lines: string[] = [];
  lines.push(`repository: ${result.repository}`);
  lines.push(`adapter: ${result.adapter.id}`);
  lines.push(`framework: ${result.adapter.framework ?? "none"}`);
  tally(lines, "files found", result.coverage.filesFound);
  tally(lines, "files parsed", result.coverage.filesParsed);
  tally(lines, "files skipped", result.coverage.filesSkipped);
  const sum = result.coverage.filesParsed + result.coverage.filesSkipped;
  lines.push(`parsed + skipped = found: ${sum === result.coverage.filesFound ? "yes" : "no"} (${sum})`);
  tally(lines, "folders", result.coverage.folders);
  tally(lines, "excluded directories", result.excludedDirectories.length);
  for (const directory of result.excludedDirectories) {
    lines.push(`  ${directory.path} — ${directory.reason} (${directory.detail})`);
  }
  lines.push(`edges: ${result.edges.length}`);
  lines.push(`  IMPORTS ${countKind(result, "IMPORTS")}`);
  lines.push(`  RE_EXPORTS ${countKind(result, "RE_EXPORTS")}`);
  lines.push(`  DYNAMIC_IMPORT ${countKind(result, "DYNAMIC_IMPORT")}`);
  lines.push(`  REQUIRES ${countKind(result, "REQUIRES")}`);
  lines.push(`routes: ${result.routes.length}`);
  for (const route of result.routes) {
    lines.push(`  ${route.method} ${route.pattern} — ${route.file}:${route.line}`);
  }
  const roleCounts = new Map<string, number>();
  for (const file of result.files) roleCounts.set(file.role, (roleCounts.get(file.role) ?? 0) + 1);
  const roles = [...roleCounts.entries()].sort((left, right) => left[0].localeCompare(right[0]));
  lines.push("roles:");
  for (const [role, count] of roles) lines.push(`  ${role}: ${count}`);
  lines.push(`imports seen: ${result.coverage.importsSeen}`);
  lines.push(`  resolved: ${result.coverage.importsResolved}`);
  lines.push(`  external: ${result.coverage.importsExternal}`);
  lines.push(`  excluded: ${result.coverage.importsExcluded}`);
  lines.push(`  unresolved: ${result.coverage.importsUnresolved}`);
  lines.push(`re-exports found: ${result.coverage.reexportsFound}`);
  lines.push(`re-exports resolved: ${result.coverage.reexportsResolved}`);
  const gaps = result.imports.filter(
    (record) => record.kind === "RE_EXPORTS" && record.outcome !== "resolved",
  );
  if (gaps.length === 0) {
    lines.push("re-export gaps: none");
  } else {
    lines.push(`re-export gaps: ${gaps.length}`);
    for (const gap of gaps) {
      lines.push(`  ${gap.from}:${gap.line} ${gap.specifier} — ${gap.outcome}: ${gap.reason}`);
    }
  }
  if (result.coverage.failures.length === 0) {
    lines.push("failures: none");
  } else {
    lines.push(`failures: ${result.coverage.failures.length}`);
    for (const failure of result.coverage.failures) {
      lines.push(`  ${failure.from}:${failure.line} ${failure.specifier} — ${failure.reason}`);
    }
  }
  lines.push("skipped:");
  if (result.skipped.length === 0) {
    lines.push("  none");
  }
  for (const file of result.skipped) {
    lines.push(`  ${file.path} — ${file.reason} (${file.detail})`);
  }
  return lines.join("\n");
}

function countKind(result: ParseResult, kind: EdgeKind): number {
  let count = 0;
  for (const edge of result.edges) {
    if (edge.kind === kind) count += 1;
  }
  return count;
}
