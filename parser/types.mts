// Contract written by the parser command. Later phases read this shape; they
// don't get a second one.

export const PARSE_RESULT_VERSION = 1 as const;

export type EdgeKind = "IMPORTS" | "RE_EXPORTS" | "DYNAMIC_IMPORT" | "REQUIRES";

export type ImportOutcome = "resolved" | "external" | "excluded" | "unresolved";

export interface ParsedFile {
  path: string;
  folder: string;
  module: string;
  lines: number;
  bytes: number;
  hash: string;
  fanIn: number;
  fanOut: number;
  role: string;
  roleSource: string;
  /** Names written onto `module.exports` or `exports`. Empty when the file has none. */
  exports: string[];
}

export interface SkippedFile {
  path: string;
  folder: string;
  reason: string;
  detail: string;
}

export interface ExcludedDirectory {
  path: string;
  reason: string;
  detail: string;
}

export interface DependencyEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  specifier: string;
  line: number;
  typeOnly: boolean;
}

export interface ImportRecord {
  from: string;
  specifier: string;
  line: number;
  kind: EdgeKind;
  typeOnly: boolean;
  outcome: ImportOutcome;
  target: string | null;
  reason: string | null;
}

export interface AdapterRoute {
  method: string;
  pattern: string;
  file: string;
  line: number;
}

export interface CoverageReport {
  filesFound: number;
  filesParsed: number;
  filesSkipped: number;
  importsSeen: number;
  importsResolved: number;
  importsExternal: number;
  importsExcluded: number;
  importsUnresolved: number;
  reexportsFound: number;
  reexportsResolved: number;
  reexportsExternal: number;
  reexportsExcluded: number;
  reexportsUnresolved: number;
  dynamicImportsFound: number;
  dynamicImportsResolved: number;
  folders: number;
  failures: ImportRecord[];
}

export interface ParseResult {
  version: typeof PARSE_RESULT_VERSION;
  repository: string;
  hashAlgorithm: "sha256";
  adapter: {
    id: string;
    framework: string | null;
  };
  files: ParsedFile[];
  skipped: SkippedFile[];
  excludedDirectories: ExcludedDirectory[];
  edges: DependencyEdge[];
  imports: ImportRecord[];
  routes: AdapterRoute[];
  coverage: CoverageReport;
}
