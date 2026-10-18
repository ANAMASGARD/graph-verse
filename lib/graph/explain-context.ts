import "server-only";

import { foldFiles, type MapEdge, type MapFile } from "@/lib/map/fold.mts";
import type {
  ClassifyInput,
  FileInput,
  FolderFile,
  FolderInput,
  NeighbourFacts,
  PromptEdgeKind,
} from "@/lib/ai/prompts";
import { sortNeighbourKinds } from "@/lib/ai/prompts";
import { getOrgGraph } from "@/lib/falkordb-org-graph";
import { parseQueryRows, type TabularGraphData } from "@/lib/graph/parse-query-rows";

type Graph = Awaited<ReturnType<typeof getOrgGraph>>;

type QueryReply = {
  headers?: string[];
  data?: TabularGraphData;
};

type CypherParams = { [key: string]: null | string | number | boolean | string[] | CypherParams[] };

type StoredFileRow = {
  id: string;
  path: string;
  hash: string;
  exports: string[];
  role: string;
  roleSource: string;
  fanIn: number;
  fanOut: number;
  folder: string;
};

type EdgeRow = {
  fromPath: string;
  toPath: string;
  kind: PromptEdgeKind;
  typeOnly: boolean;
};

async function queryRows<T extends Record<string, unknown>>(
  graph: Graph,
  cypher: string,
  params: CypherParams,
): Promise<T[]> {
  const reply = (await graph.query(cypher, { params })) as QueryReply;
  return parseQueryRows<T>(reply);
}

export type StoredExplainFile = { id: string; path: string; hash: string; needsClassify: boolean };

export async function loadFileInput(
  orgId: string,
  analysisId: string,
  path: string,
): Promise<{ file: StoredExplainFile; input: FileInput; classify: ClassifyInput } | null> {
  const graph = await getOrgGraph(orgId);
  const rows = await queryRows<Record<string, unknown>>(
    graph,
    `
    MATCH (a:Analysis {id: $analysisId})-[:HAS_FILE]->(f:File {path: $path})
    WHERE f.skipReason IS NULL
    RETURN
      f.id AS id,
      f.path AS path,
      f.hash AS hash,
      f.exports AS exports,
      f.role AS role,
      f.roleSource AS roleSource
    LIMIT 1
    `,
    { analysisId, path },
  );
  const row = rows[0];
  if (!row || typeof row.id !== "string" || typeof row.path !== "string" || typeof row.hash !== "string") {
    return null;
  }
  if (typeof row.role !== "string" || typeof row.roleSource !== "string") return null;
  const exports = stringArray(row.exports);
  if (exports === null) return null;

  const edgeRows = await queryRows<Record<string, unknown>>(
    graph,
    `
    MATCH (a:Analysis {id: $analysisId})-[:HAS_FILE]->(from:File)-[r:IMPORTS|RE_EXPORTS|DYNAMIC_IMPORT|REQUIRES]->(to:File)<-[:HAS_FILE]-(a)
    WHERE from.path = $path OR to.path = $path
    RETURN
      from.path AS fromPath,
      to.path AS toPath,
      type(r) AS kind,
      coalesce(r.typeOnly, false) AS typeOnly,
      from.exports AS fromExports,
      from.role AS fromRole,
      from.roleSource AS fromRoleSource,
      to.exports AS toExports,
      to.role AS toRole,
      to.roleSource AS toRoleSource
    `,
    { analysisId, path },
  );

  const neighbours = neighbourMaps(path, edgeRows);
  const roleForExplain = roleForModel(row.roleSource) ? row.role : null;
  const input: FileInput = {
    path: row.path,
    hash: row.hash,
    role: roleForExplain,
    exports,
    imports: neighbours.imports,
    importedBy: neighbours.importedBy,
  };
  const classify: ClassifyInput = {
    path: row.path,
    hash: row.hash,
    exports,
    imports: input.imports.map((neighbour) => ({ path: neighbour.path, role: neighbour.role })),
    importedBy: input.importedBy.map((neighbour) => ({ path: neighbour.path, role: neighbour.role })),
  };
  return {
    file: {
      id: row.id,
      path: row.path,
      hash: row.hash,
      needsClassify: row.roleSource === "fallback",
    },
    input,
    classify,
  };
}

export async function loadFolderInput(orgId: string, analysisId: string, dir: string): Promise<FolderInput | null> {
  const graph = await getOrgGraph(orgId);
  const fileRows = await queryRows<Record<string, unknown>>(
    graph,
    `
    MATCH (a:Analysis {id: $analysisId})-[:HAS_FILE]->(f:File)
    WHERE f.skipReason IS NULL
    RETURN
      f.id AS id,
      f.path AS path,
      f.folder AS folder,
      f.hash AS hash,
      f.exports AS exports,
      f.role AS role,
      f.roleSource AS roleSource,
      f.fanIn AS fanIn,
      f.fanOut AS fanOut
    `,
    { analysisId },
  );
  const files: StoredFileRow[] = [];
  for (const row of fileRows) {
    const parsed = parseStoredFile(row);
    if (parsed) files.push(parsed);
  }
  if (files.length === 0) return null;

  const mapFiles: MapFile[] = files.map((file) => ({
    path: file.path,
    folder: file.folder,
    role: file.role,
    fanIn: file.fanIn,
    fanOut: file.fanOut,
  }));
  const edgeRows = await queryRows<Record<string, unknown>>(
    graph,
    `
    MATCH (a:Analysis {id: $analysisId})-[:HAS_FILE]->(from:File)-[:IMPORTS|RE_EXPORTS|DYNAMIC_IMPORT|REQUIRES]->(to:File)<-[:HAS_FILE]-(a)
    RETURN from.path AS fromPath, to.path AS toPath
    `,
    { analysisId },
  );
  const edges: MapEdge[] = [];
  for (const row of edgeRows) {
    if (typeof row.fromPath !== "string" || typeof row.toPath !== "string") continue;
    edges.push({ from: row.fromPath, to: row.toPath });
  }

  const folded = foldFiles(mapFiles, edges);
  const node = folded.nodes.find((entry) => entry.id === dir);
  if (!node) return null;

  const inside = new Set(node.files.map((file) => file.path));
  const crossRows = await queryRows<Record<string, unknown>>(
    graph,
    `
    MATCH (a:Analysis {id: $analysisId})-[:HAS_FILE]->(from:File)-[:IMPORTS|RE_EXPORTS|DYNAMIC_IMPORT|REQUIRES]->(to:File)<-[:HAS_FILE]-(a)
    RETURN from.path AS fromPath, to.path AS toPath
    `,
    { analysisId },
  );
  const incoming = new Map<string, { from: string; to: string }>();
  const outgoing = new Map<string, { from: string; to: string }>();
  for (const row of crossRows) {
    if (typeof row.fromPath !== "string" || typeof row.toPath !== "string") continue;
    const source = row.fromPath;
    const target = row.toPath;
    if (!inside.has(source) && inside.has(target)) incoming.set(`${source}\0${target}`, { from: source, to: target });
    if (inside.has(source) && !inside.has(target)) outgoing.set(`${source}\0${target}`, { from: source, to: target });
  }

  const byPath = new Map(files.map((file) => [file.path, file]));
  const members: FolderFile[] = node.files.map((file) => {
    const stored = byPath.get(file.path);
    if (!stored) throw new Error(`Folded file ${file.path} isn't in the file list it was folded from`);
    return {
      path: stored.path,
      hash: stored.hash,
      role: roleForModel(stored.roleSource) ? stored.role : null,
      exports: stored.exports,
      fanIn: stored.fanIn,
      fanOut: stored.fanOut,
    };
  });
  const order = (left: { from: string; to: string }, right: { from: string; to: string }) =>
    left.from.localeCompare(right.from) || left.to.localeCompare(right.to);
  return {
    dir,
    files: members,
    incoming: [...incoming.values()].sort(order),
    outgoing: [...outgoing.values()].sort(order),
  };
}

export async function loadModelRoles(orgId: string, analysisId: string): Promise<Record<string, string>> {
  const graph = await getOrgGraph(orgId);
  const rows = await queryRows<Record<string, unknown>>(
    graph,
    `
    MATCH (a:Analysis {id: $analysisId})-[:HAS_FILE]->(f:File)
    WHERE f.roleSource = 'model'
    RETURN f.path AS path, f.role AS role
    `,
    { analysisId },
  );
  const roles: Record<string, string> = {};
  for (const row of rows) {
    if (typeof row.path === "string" && typeof row.role === "string") roles[row.path] = row.role;
  }
  return roles;
}

export async function storeModelRole(orgId: string, fileId: string, role: string): Promise<void> {
  const graph = await getOrgGraph(orgId);
  await graph.query(
    `
    MATCH (f:File {id: $fileId})
    SET f.role = $role, f.roleSource = 'model'
    `,
    { params: { fileId, role } },
  );
}

export async function readFileHash(orgId: string, analysisId: string, path: string): Promise<string | null> {
  const graph = await getOrgGraph(orgId);
  const rows = await queryRows<{ hash: unknown }>(
    graph,
    `
    MATCH (a:Analysis {id: $analysisId})-[:HAS_FILE]->(f:File {path: $path})
    RETURN f.hash AS hash
    LIMIT 1
    `,
    { analysisId, path },
  );
  const hash = rows[0]?.hash;
  return typeof hash === "string" ? hash : null;
}

function neighbourMaps(
  path: string,
  rows: readonly Record<string, unknown>[],
): { imports: NeighbourFacts[]; importedBy: NeighbourFacts[] } {
  const imports = new Map<string, NeighbourFacts>();
  const importedBy = new Map<string, NeighbourFacts>();
  for (const row of rows) {
    const edge = parseEdgeRow(row);
    if (!edge) continue;
    if (edge.fromPath === path) {
      addNeighbour(imports, edge.toPath, edge.kind, edge.typeOnly, row, "to");
    }
    if (edge.toPath === path) {
      addNeighbour(importedBy, edge.fromPath, edge.kind, edge.typeOnly, row, "from");
    }
  }
  return { imports: sortNeighbours(imports), importedBy: sortNeighbours(importedBy) };
}

function addNeighbour(
  into: Map<string, NeighbourFacts>,
  otherPath: string,
  kind: PromptEdgeKind,
  typeOnly: boolean,
  row: Record<string, unknown>,
  prefix: "from" | "to",
): void {
  const roleSource = row[`${prefix}RoleSource`];
  const roleValue = row[`${prefix}Role`];
  const exportsValue = row[`${prefix}Exports`];
  const exports = stringArray(exportsValue) ?? [];
  const role = typeof roleSource === "string" && roleForConvention(roleSource) && typeof roleValue === "string" ? roleValue : null;
  const existing = into.get(otherPath);
  if (!existing) {
    into.set(otherPath, { path: otherPath, role, exports, kinds: [kind], typeOnly });
    return;
  }
  if (!existing.kinds.includes(kind)) existing.kinds.push(kind);
  existing.typeOnly &&= typeOnly;
}

function sortNeighbours(map: Map<string, NeighbourFacts>): NeighbourFacts[] {
  return [...map.values()]
    .map((neighbour) => ({ ...neighbour, kinds: sortNeighbourKinds(neighbour.kinds) }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function parseEdgeRow(row: Record<string, unknown>): EdgeRow | null {
  if (typeof row.fromPath !== "string" || typeof row.toPath !== "string" || typeof row.kind !== "string") {
    return null;
  }
  const kind = cypherKindToPrompt(row.kind);
  if (kind === null) return null;
  const typeOnly = row.typeOnly === true;
  return { fromPath: row.fromPath, toPath: row.toPath, kind, typeOnly };
}

function cypherKindToPrompt(kind: string): PromptEdgeKind | null {
  switch (kind) {
    case "IMPORTS":
      return "import";
    case "RE_EXPORTS":
      return "re_export";
    case "DYNAMIC_IMPORT":
      return "dynamic_import";
    case "REQUIRES":
      return "require";
    default:
      return null;
  }
}

function roleForConvention(roleSource: string): boolean {
  return roleSource !== "fallback" && roleSource !== "model";
}

function roleForModel(roleSource: string): boolean {
  return roleSource !== "fallback";
}

function parseStoredFile(row: Record<string, unknown>): StoredFileRow | null {
  if (
    typeof row.id !== "string" ||
    typeof row.path !== "string" ||
    typeof row.folder !== "string" ||
    typeof row.hash !== "string" ||
    typeof row.role !== "string" ||
    typeof row.roleSource !== "string"
  ) {
    return null;
  }
  const fanIn = asNumber(row.fanIn);
  const fanOut = asNumber(row.fanOut);
  const exports = stringArray(row.exports);
  if (fanIn === null || fanOut === null || exports === null) return null;
  return {
    id: row.id,
    path: row.path,
    folder: row.folder,
    hash: row.hash,
    exports,
    role: row.role,
    roleSource: row.roleSource,
    fanIn,
    fanOut,
  };
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((entry) => typeof entry === "string")) return null;
  return value;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}
