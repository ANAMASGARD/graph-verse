import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { selectAdapter, type AdapterFile } from "./adapters.mts";
import { assertNever } from "./assert-never.mts";
import { clearCompilerOptionsCache } from "./compiler-options.mts";
import { extractExports } from "./extract-exports.mts";
import { extractImports, nonLiteralReason, type RawImport } from "./extract-imports.mts";
import { countLines, folderOf, moduleIdOf } from "./paths.mts";
import { clearResolutionCache, resolveSpecifier, type ResolveContext } from "./resolve-import.mts";
import type {
  CoverageReport,
  DependencyEdge,
  EdgeKind,
  ImportOutcome,
  ImportRecord,
  ParsedFile,
  ParseResult,
} from "./types.mts";
import { PARSE_RESULT_VERSION } from "./types.mts";
import { assertParseResult } from "./invariants.mts";
import { walkRepository } from "./walk.mts";

interface FileDraft {
  path: string;
  absolute: string;
  folder: string;
  module: string;
  lines: number;
  bytes: number;
  hash: string;
  source: string;
}

function sha256(contents: Buffer): string {
  return createHash("sha256").update(contents).digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function recordImport(
  from: string,
  raw: RawImport,
  context: ResolveContext,
  fromAbsolute: string,
): ImportRecord {
  if (!raw.literal || raw.specifier === null) {
    return {
      from,
      specifier: raw.display,
      line: raw.line,
      kind: raw.kind,
      typeOnly: raw.typeOnly,
      outcome: "unresolved",
      target: null,
      reason: nonLiteralReason(raw.kind),
    };
  }
  if (raw.specifier === "") {
    return {
      from,
      specifier: raw.specifier,
      line: raw.line,
      kind: raw.kind,
      typeOnly: raw.typeOnly,
      outcome: "unresolved",
      target: null,
      reason: "specifier is empty",
    };
  }
  const resolution = resolveSpecifier(fromAbsolute, raw.specifier, context);
  return {
    from,
    specifier: raw.specifier,
    line: raw.line,
    kind: raw.kind,
    typeOnly: raw.typeOnly,
    outcome: resolution.outcome,
    target: resolution.target,
    reason: resolution.reason,
  };
}

/**
 * Same from, to, and kind is one edge. A value import wins over a type-only
 * duplicate, and the earliest line is kept. Fan-in and fan-out then count
 * the edges that remain.
 */
function dedupeEdges(edges: readonly DependencyEdge[]): DependencyEdge[] {
  const byKey = new Map<string, DependencyEdge>();
  for (const edge of edges) {
    const key = `${edge.from}\0${edge.to}\0${edge.kind}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, edge);
      continue;
    }
    byKey.set(key, {
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      specifier: existing.line <= edge.line ? existing.specifier : edge.specifier,
      line: Math.min(existing.line, edge.line),
      typeOnly: existing.typeOnly && edge.typeOnly,
    });
  }
  return [...byKey.values()];
}

function emptyCoverage(): CoverageReport {
  return {
    filesFound: 0,
    filesParsed: 0,
    filesSkipped: 0,
    importsSeen: 0,
    importsResolved: 0,
    importsExternal: 0,
    importsExcluded: 0,
    importsUnresolved: 0,
    reexportsFound: 0,
    reexportsResolved: 0,
    reexportsExternal: 0,
    reexportsExcluded: 0,
    reexportsUnresolved: 0,
    dynamicImportsFound: 0,
    dynamicImportsResolved: 0,
    folders: 0,
    failures: [],
  };
}

function addOutcome(coverage: CoverageReport, outcome: ImportOutcome): void {
  switch (outcome) {
    case "resolved":
      coverage.importsResolved += 1;
      return;
    case "external":
      coverage.importsExternal += 1;
      return;
    case "excluded":
      coverage.importsExcluded += 1;
      return;
    case "unresolved":
      coverage.importsUnresolved += 1;
      return;
    default:
      assertNever(outcome, "import outcome");
  }
}

function addKind(coverage: CoverageReport, kind: EdgeKind, outcome: ImportOutcome): void {
  switch (kind) {
    case "IMPORTS":
    case "REQUIRES":
      return;
    case "RE_EXPORTS":
      coverage.reexportsFound += 1;
      if (outcome === "resolved") coverage.reexportsResolved += 1;
      if (outcome === "external") coverage.reexportsExternal += 1;
      if (outcome === "excluded") coverage.reexportsExcluded += 1;
      if (outcome === "unresolved") coverage.reexportsUnresolved += 1;
      return;
    case "DYNAMIC_IMPORT":
      coverage.dynamicImportsFound += 1;
      if (outcome === "resolved") coverage.dynamicImportsResolved += 1;
      return;
    default:
      assertNever(kind, "edge kind");
  }
}

export function parseRepository(directory: string): ParseResult {
  clearCompilerOptionsCache();
  clearResolutionCache();
  const resolved = path.resolve(directory);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`not a directory: ${directory}`);
  }
  // Real path, so TypeScript's resolved filenames match the files we walked.
  const root = fs.realpathSync(resolved);

  const walked = walkRepository(root);
  const drafts: FileDraft[] = [];
  for (const file of walked.source) {
    let contents: Buffer;
    try {
      contents = fs.readFileSync(file.absolute);
    } catch (error) {
      walked.skipped.push({
        path: file.path,
        folder: folderOf(file.path),
        reason: "unreadable",
        detail: errorMessage(error),
      });
      continue;
    }
    const source = contents.toString("utf8");
    drafts.push({
      path: file.path,
      absolute: file.absolute,
      folder: folderOf(file.path),
      module: moduleIdOf(file.path),
      lines: countLines(source),
      bytes: contents.length,
      hash: sha256(contents),
      source,
    });
  }
  walked.skipped.sort((left, right) => left.path.localeCompare(right.path));

  const context: ResolveContext = {
    root,
    parsed: new Set(drafts.map((file) => file.path)),
    skipped: new Map(walked.skipped.map((file) => [file.path, file.reason])),
    excludedDirectories: walked.excludedDirectories,
  };

  const imports: ImportRecord[] = [];
  for (const file of drafts) {
    for (const raw of extractImports(file.path, file.source)) {
      imports.push(recordImport(file.path, raw, context, file.absolute));
    }
  }
  imports.sort((left, right) => {
    return (
      left.from.localeCompare(right.from) ||
      left.line - right.line ||
      left.kind.localeCompare(right.kind) ||
      left.specifier.localeCompare(right.specifier)
    );
  });

  const resolvedEdges: DependencyEdge[] = [];
  for (const record of imports) {
    if (record.outcome !== "resolved" || record.target === null) continue;
    resolvedEdges.push({
      from: record.from,
      to: record.target,
      kind: record.kind,
      specifier: record.specifier,
      line: record.line,
      typeOnly: record.typeOnly,
    });
  }
  const edges = dedupeEdges(resolvedEdges);
  edges.sort((left, right) => {
    return (
      left.from.localeCompare(right.from) ||
      left.to.localeCompare(right.to) ||
      left.kind.localeCompare(right.kind) ||
      left.line - right.line
    );
  });

  const adapterFiles: AdapterFile[] = drafts.map((file) => ({
    path: file.path,
    folder: file.folder,
    module: file.module,
    source: file.source,
  }));
  const adapter = selectAdapter(adapterFiles);
  const assignment = adapter.assign(adapterFiles);
  const roles = new Map(assignment.roles.map((role) => [role.path, role]));

  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  for (const edge of edges) {
    fanOut.set(edge.from, (fanOut.get(edge.from) ?? 0) + 1);
    fanIn.set(edge.to, (fanIn.get(edge.to) ?? 0) + 1);
  }

  const files: ParsedFile[] = drafts.map((file) => {
    const role = roles.get(file.path);
    if (!role) {
      throw new Error(`adapter ${adapter.id} did not assign a role to ${file.path}`);
    }
    return {
      path: file.path,
      folder: file.folder,
      module: file.module,
      lines: file.lines,
      bytes: file.bytes,
      hash: file.hash,
      fanIn: fanIn.get(file.path) ?? 0,
      fanOut: fanOut.get(file.path) ?? 0,
      role: role.role,
      roleSource: role.roleSource,
      exports: extractExports(file.path, file.source),
    };
  });
  files.sort((left, right) => left.path.localeCompare(right.path));

  const coverage = emptyCoverage();
  coverage.filesParsed = files.length;
  coverage.filesSkipped = walked.skipped.length;
  coverage.filesFound = coverage.filesParsed + coverage.filesSkipped;
  coverage.folders = new Set(files.map((file) => file.folder)).size;
  for (const record of imports) {
    coverage.importsSeen += 1;
    addOutcome(coverage, record.outcome);
    addKind(coverage, record.kind, record.outcome);
    if (record.outcome === "unresolved") coverage.failures.push(record);
  }

  const result: ParseResult = {
    version: PARSE_RESULT_VERSION,
    repository: path.basename(root),
    hashAlgorithm: "sha256",
    adapter: {
      id: adapter.id,
      framework: assignment.framework,
    },
    files,
    skipped: walked.skipped,
    excludedDirectories: walked.excludedDirectories,
    edges,
    imports,
    routes: [...assignment.routes],
    coverage,
  };
  assertParseResult(result);
  return result;
}
