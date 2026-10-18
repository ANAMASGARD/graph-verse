import { assertNever } from "./assert-never.mts";
import type { DependencyEdge, EdgeKind, ImportRecord, ParseResult } from "./types.mts";

function edgeCount(edges: readonly DependencyEdge[], file: string, direction: "in" | "out"): number {
  let count = 0;
  for (const edge of edges) {
    if (direction === "in" && edge.to === file) count += 1;
    if (direction === "out" && edge.from === file) count += 1;
  }
  return count;
}

function expectedKindCounts(imports: readonly ImportRecord[], kind: EdgeKind): {
  found: number;
  resolved: number;
  external: number;
  excluded: number;
  unresolved: number;
} {
  let found = 0;
  let resolved = 0;
  let external = 0;
  let excluded = 0;
  let unresolved = 0;
  for (const record of imports) {
    if (record.kind !== kind) continue;
    found += 1;
    switch (record.outcome) {
      case "resolved":
        resolved += 1;
        break;
      case "external":
        external += 1;
        break;
      case "excluded":
        excluded += 1;
        break;
      case "unresolved":
        unresolved += 1;
        break;
      default:
        assertNever(record.outcome, "import outcome");
    }
  }
  return { found, resolved, external, excluded, unresolved };
}

export function assertParseResult(result: ParseResult): void {
  const { coverage } = result;
  if (coverage.filesParsed !== result.files.length) {
    throw new Error("files parsed does not match the file list");
  }
  if (coverage.filesSkipped !== result.skipped.length) {
    throw new Error("files skipped does not match the skip list");
  }
  if (coverage.filesFound !== coverage.filesParsed + coverage.filesSkipped) {
    throw new Error("files found is not parsed plus skipped");
  }
  if (coverage.importsSeen !== result.imports.length) {
    throw new Error("imports seen does not match the import list");
  }

  let resolved = 0;
  let external = 0;
  let excluded = 0;
  let unresolved = 0;
  for (const record of result.imports) {
    switch (record.outcome) {
      case "resolved":
        resolved += 1;
        if (record.target === null) throw new Error(`resolved import has no target: ${record.from} ${record.specifier}`);
        break;
      case "external":
        external += 1;
        if (record.reason === null || record.reason === "") {
          throw new Error(`external import has no reason: ${record.from} ${record.specifier}`);
        }
        break;
      case "excluded":
        excluded += 1;
        if (record.reason === null || record.reason === "") {
          throw new Error(`excluded import has no reason: ${record.from} ${record.specifier}`);
        }
        break;
      case "unresolved":
        unresolved += 1;
        if (record.reason === null || record.reason === "") {
          throw new Error(`unresolved import has no reason: ${record.from} ${record.specifier}`);
        }
        break;
      default:
        assertNever(record.outcome, "import outcome");
    }
  }
  if (
    resolved !== coverage.importsResolved ||
    external !== coverage.importsExternal ||
    excluded !== coverage.importsExcluded ||
    unresolved !== coverage.importsUnresolved
  ) {
    throw new Error("import outcome counts do not match the import list");
  }

  const failures = result.imports.filter((record) => record.outcome === "unresolved");
  if (JSON.stringify(failures) !== JSON.stringify(coverage.failures)) {
    throw new Error("failure examples do not match unresolved imports");
  }

  const reexports = expectedKindCounts(result.imports, "RE_EXPORTS");
  if (
    reexports.found !== coverage.reexportsFound ||
    reexports.resolved !== coverage.reexportsResolved ||
    reexports.external !== coverage.reexportsExternal ||
    reexports.excluded !== coverage.reexportsExcluded ||
    reexports.unresolved !== coverage.reexportsUnresolved
  ) {
    throw new Error("re-export counts do not match the import list");
  }
  const dynamic = expectedKindCounts(result.imports, "DYNAMIC_IMPORT");
  if (
    dynamic.found !== coverage.dynamicImportsFound ||
    dynamic.resolved !== coverage.dynamicImportsResolved
  ) {
    throw new Error("dynamic import counts do not match the import list");
  }

  const paths = new Set<string>();
  const folders = new Set<string>();
  for (const file of result.files) {
    if (file.folder === "") throw new Error(`parsed file has no folder: ${file.path}`);
    if (paths.has(file.path)) throw new Error(`duplicate parsed file: ${file.path}`);
    paths.add(file.path);
    folders.add(file.folder);
    if (file.fanIn !== edgeCount(result.edges, file.path, "in")) {
      throw new Error(`fan-in does not match edges for ${file.path}`);
    }
    if (file.fanOut !== edgeCount(result.edges, file.path, "out")) {
      throw new Error(`fan-out does not match edges for ${file.path}`);
    }
    const exportNames = new Set<string>();
    for (const name of file.exports) {
      if (name.trim() === "") throw new Error(`export name is empty: ${file.path}`);
      if (exportNames.has(name)) throw new Error(`duplicate export name on ${file.path}: ${name}`);
      exportNames.add(name);
    }
  }
  if (folders.size !== coverage.folders) {
    throw new Error("folder count does not match parsed files");
  }
  for (const file of result.skipped) {
    if (file.folder === "") throw new Error(`skipped file has no folder: ${file.path}`);
    if (file.reason.trim() === "") throw new Error(`skipped file has no reason: ${file.path}`);
  }
  for (const edge of result.edges) {
    if (!paths.has(edge.from) || !paths.has(edge.to)) {
      throw new Error(`edge endpoint is not a parsed file: ${edge.from} -> ${edge.to}`);
    }
  }
  for (const route of result.routes) {
    if (!paths.has(route.file)) throw new Error(`route file was not parsed: ${route.file}`);
    if (route.method.trim() === "") throw new Error(`route has no method: ${route.file}`);
    if (!route.pattern.startsWith("/")) throw new Error(`route pattern is not a full path: ${route.file}`);
  }
  for (const directory of result.excludedDirectories) {
    if (directory.reason.trim() === "") {
      throw new Error(`excluded directory has no reason: ${directory.path}`);
    }
  }
}
