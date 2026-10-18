import fs from "node:fs";

import { assertParseResult } from "./invariants.mts";
import { PARSE_RESULT_VERSION } from "./types.mts";
import type {
  AdapterRoute,
  CoverageReport,
  DependencyEdge,
  EdgeKind,
  ExcludedDirectory,
  ImportOutcome,
  ImportRecord,
  ParsedFile,
  ParseResult,
  SkippedFile,
} from "./types.mts";

function fail(at: string, message: string): never {
  throw new Error(`${at} ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, at: string): Record<string, unknown> {
  if (!isRecord(value)) fail(at, "must be an object");
  return value;
}

function stringField(value: Record<string, unknown>, key: string, at: string): string {
  const field = value[key];
  if (typeof field !== "string") fail(`${at}.${key}`, "must be a string");
  return field;
}

function numberField(value: Record<string, unknown>, key: string, at: string): number {
  const field = value[key];
  if (typeof field !== "number" || !Number.isFinite(field)) fail(`${at}.${key}`, "must be a number");
  return field;
}

function booleanField(value: Record<string, unknown>, key: string, at: string): boolean {
  const field = value[key];
  if (typeof field !== "boolean") fail(`${at}.${key}`, "must be a boolean");
  return field;
}

function stringList(value: Record<string, unknown>, key: string, at: string): string[] {
  const field = value[key];
  if (!Array.isArray(field)) fail(`${at}.${key}`, "must be an array");
  return field.map((item, index) => {
    if (typeof item !== "string" || item.trim() === "") {
      fail(`${at}.${key}[${index}]`, "must be a non-empty string");
    }
    return item;
  });
}

function stringOrNull(value: Record<string, unknown>, key: string, at: string): string | null {
  const field = value[key];
  if (field === null) return null;
  if (typeof field !== "string") fail(`${at}.${key}`, "must be a string or null");
  return field;
}

function arrayField(value: Record<string, unknown>, key: string, at: string): unknown[] {
  const field = value[key];
  if (!Array.isArray(field)) fail(`${at}.${key}`, "must be an array");
  return field;
}

function edgeKind(value: unknown, at: string): EdgeKind {
  if (value === "IMPORTS" || value === "RE_EXPORTS" || value === "DYNAMIC_IMPORT" || value === "REQUIRES") {
    return value;
  }
  fail(at, "has an unknown edge kind");
}

function importOutcome(value: unknown, at: string): ImportOutcome {
  if (
    value === "resolved" ||
    value === "external" ||
    value === "excluded" ||
    value === "unresolved"
  ) {
    return value;
  }
  fail(at, "has an unknown import outcome");
}

function parsedFile(value: unknown, at: string): ParsedFile {
  const row = record(value, at);
  const hash = stringField(row, "hash", at);
  if (!/^[a-f0-9]{64}$/.test(hash)) fail(`${at}.hash`, "must be a sha256 hex digest");
  const folder = stringField(row, "folder", at);
  if (folder === "") fail(`${at}.folder`, "must be set");
  return {
    path: stringField(row, "path", at),
    folder,
    module: stringField(row, "module", at),
    lines: numberField(row, "lines", at),
    bytes: numberField(row, "bytes", at),
    hash,
    fanIn: numberField(row, "fanIn", at),
    fanOut: numberField(row, "fanOut", at),
    role: stringField(row, "role", at),
    roleSource: stringField(row, "roleSource", at),
    exports: stringList(row, "exports", at),
  };
}

function skippedFile(value: unknown, at: string): SkippedFile {
  const row = record(value, at);
  const reason = stringField(row, "reason", at);
  if (reason.trim() === "") fail(`${at}.reason`, "must be set");
  const folder = stringField(row, "folder", at);
  if (folder === "") fail(`${at}.folder`, "must be set");
  return {
    path: stringField(row, "path", at),
    folder,
    reason,
    detail: stringField(row, "detail", at),
  };
}

function excludedDirectory(value: unknown, at: string): ExcludedDirectory {
  const row = record(value, at);
  const reason = stringField(row, "reason", at);
  if (reason.trim() === "") fail(`${at}.reason`, "must be set");
  return {
    path: stringField(row, "path", at),
    reason,
    detail: stringField(row, "detail", at),
  };
}

function edge(value: unknown, at: string): DependencyEdge {
  const row = record(value, at);
  return {
    from: stringField(row, "from", at),
    to: stringField(row, "to", at),
    kind: edgeKind(row.kind, `${at}.kind`),
    specifier: stringField(row, "specifier", at),
    line: numberField(row, "line", at),
    typeOnly: booleanField(row, "typeOnly", at),
  };
}

function importRecord(value: unknown, at: string): ImportRecord {
  const row = record(value, at);
  return {
    from: stringField(row, "from", at),
    specifier: stringField(row, "specifier", at),
    line: numberField(row, "line", at),
    kind: edgeKind(row.kind, `${at}.kind`),
    typeOnly: booleanField(row, "typeOnly", at),
    outcome: importOutcome(row.outcome, `${at}.outcome`),
    target: stringOrNull(row, "target", at),
    reason: stringOrNull(row, "reason", at),
  };
}

function route(value: unknown, at: string): AdapterRoute {
  const row = record(value, at);
  return {
    method: stringField(row, "method", at),
    pattern: stringField(row, "pattern", at),
    file: stringField(row, "file", at),
    line: numberField(row, "line", at),
  };
}

function coverage(value: unknown, at: string): CoverageReport {
  const row = record(value, at);
  const failures = arrayField(row, "failures", at).map((item, index) =>
    importRecord(item, `${at}.failures[${index}]`),
  );
  return {
    filesFound: numberField(row, "filesFound", at),
    filesParsed: numberField(row, "filesParsed", at),
    filesSkipped: numberField(row, "filesSkipped", at),
    importsSeen: numberField(row, "importsSeen", at),
    importsResolved: numberField(row, "importsResolved", at),
    importsExternal: numberField(row, "importsExternal", at),
    importsExcluded: numberField(row, "importsExcluded", at),
    importsUnresolved: numberField(row, "importsUnresolved", at),
    reexportsFound: numberField(row, "reexportsFound", at),
    reexportsResolved: numberField(row, "reexportsResolved", at),
    reexportsExternal: numberField(row, "reexportsExternal", at),
    reexportsExcluded: numberField(row, "reexportsExcluded", at),
    reexportsUnresolved: numberField(row, "reexportsUnresolved", at),
    dynamicImportsFound: numberField(row, "dynamicImportsFound", at),
    dynamicImportsResolved: numberField(row, "dynamicImportsResolved", at),
    folders: numberField(row, "folders", at),
    failures,
  };
}

export function parseResultFromUnknown(value: unknown): ParseResult {
  const row = record(value, "result");
  const version = numberField(row, "version", "result");
  if (version !== PARSE_RESULT_VERSION) fail("result.version", `must be ${PARSE_RESULT_VERSION}`);
  const hashAlgorithm = stringField(row, "hashAlgorithm", "result");
  if (hashAlgorithm !== "sha256") fail("result.hashAlgorithm", "must be sha256");
  const adapter = record(row.adapter, "result.adapter");
  const framework = adapter.framework;
  if (framework !== null && typeof framework !== "string") {
    fail("result.adapter.framework", "must be a string or null");
  }
  const result: ParseResult = {
    version: PARSE_RESULT_VERSION,
    repository: stringField(row, "repository", "result"),
    hashAlgorithm: "sha256",
    adapter: {
      id: stringField(adapter, "id", "result.adapter"),
      framework,
    },
    files: arrayField(row, "files", "result").map((item, index) => parsedFile(item, `result.files[${index}]`)),
    skipped: arrayField(row, "skipped", "result").map((item, index) =>
      skippedFile(item, `result.skipped[${index}]`),
    ),
    excludedDirectories: arrayField(row, "excludedDirectories", "result").map((item, index) =>
      excludedDirectory(item, `result.excludedDirectories[${index}]`),
    ),
    edges: arrayField(row, "edges", "result").map((item, index) => edge(item, `result.edges[${index}]`)),
    imports: arrayField(row, "imports", "result").map((item, index) =>
      importRecord(item, `result.imports[${index}]`),
    ),
    routes: arrayField(row, "routes", "result").map((item, index) => route(item, `result.routes[${index}]`)),
    coverage: coverage(row.coverage, "result.coverage"),
  };
  assertParseResult(result);
  return result;
}

export function readParseResult(filePath: string): ParseResult {
  const text = fs.readFileSync(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`cannot read parse result: ${message}`);
  }
  return parseResultFromUnknown(parsed);
}
