import "server-only";

import { randomUUID } from "node:crypto";

import type { EdgeKind, ParseResult } from "@/parser/types.mts";
import { getOrgGraph } from "@/lib/falkordb-org-graph";
import {
  isAnalysisStage,
  isAnalysisStatus,
  type AnalysisStage,
  type AnalysisStatus,
  type ProgressEvent,
} from "@/lib/graph/analysis-types";
import { parseQueryRows, type TabularGraphData } from "@/lib/graph/parse-query-rows";
import type { DetailFile } from "@/lib/map/detail.mts";
import type { MapEdge } from "@/lib/map/fold.mts";
import type { MapCoverage } from "@/lib/map/coverage.mts";
import type { MapRoute } from "@/lib/map/taxonomy.mts";
import { publishProgress } from "@/lib/progress/channel";

const SCHEMA_VERSION = 2;
const FILE_BATCH = 150;

type Graph = Awaited<ReturnType<typeof getOrgGraph>>;

export type StageUpdate = {
  status: AnalysisStatus;
  stage: AnalysisStage | null;
  message: string;
  commitSha: string | null;
  finished: boolean;
  error: string | null;
};

export type StoredAnalysis = {
  id: string;
  status: AnalysisStatus;
  stage: AnalysisStage | null;
  stageMessage: string | null;
  error: string | null;
  commitSha: string | null;
  createdAt: string;
  startedAt: string | null;
  owner: string;
  name: string;
  framework: string | null;
  importCount: number;
  routeCount: number;
  coverage: MapCoverage | null;
};

type QueryReply = {
  headers?: string[];
  data?: TabularGraphData;
};

type CypherValue = null | string | number | boolean | CypherValue[] | { [key: string]: CypherValue };
type CypherParams = { [key: string]: CypherValue };

async function queryRows<T extends Record<string, unknown>>(
  graph: Graph,
  cypher: string,
  params: CypherParams,
): Promise<T[]> {
  const reply = (await graph.query(cypher, { params })) as QueryReply;
  return parseQueryRows<T>(reply);
}

export async function findAnalysisId(orgId: string, owner: string, name: string): Promise<string | null> {
  const graph = await getOrgGraph(orgId);
  const rows = await queryRows<{ id: unknown }>(
    graph,
    `
    MATCH (p:Project {repoOwner: $owner, repoName: $name})-[:HAS_ANALYSIS]->(a:Analysis)
    RETURN a.id AS id
    LIMIT 1
    `,
    { owner, name },
  );
  const id = rows[0]?.id;
  return typeof id === "string" ? id : null;
}

export async function createQueuedAnalysis(
  orgId: string,
  analysisId: string,
  owner: string,
  name: string,
): Promise<void> {
  const graph = await getOrgGraph(orgId);
  const now = new Date().toISOString();
  await graph.query(
    `
    MERGE (p:Project {repoOwner: $owner, repoName: $name})
    ON CREATE SET p.id = $projectId, p.createdAt = $now
    WITH p
    CREATE (a:Analysis {
      id: $analysisId,
      status: 'queued',
      stage: 'fetch',
      stageMessage: $message,
      commitSha: null,
      coverage: null,
      error: null,
      framework: null,
      importCount: 0,
      routeCount: 0,
      createdAt: $now,
      startedAt: null,
      finishedAt: null,
      schemaVersion: $schemaVersion
    })
    CREATE (p)-[:HAS_ANALYSIS]->(a)
    `,
    {
      params: {
        owner,
        name,
        projectId: randomUUID(),
        analysisId,
        message: "Waiting to fetch.",
        now,
        schemaVersion: SCHEMA_VERSION,
      },
    },
  );
  await publishProgress(analysisId, {
    status: "queued",
    stage: "fetch",
    message: "Waiting to fetch.",
  });
}

export async function recordStage(orgId: string, analysisId: string, update: StageUpdate): Promise<void> {
  const graph = await getOrgGraph(orgId);
  const now = new Date().toISOString();
  await graph.query(
    `
    MATCH (a:Analysis {id: $id})
    SET a.status = $status,
        a.stage = $stage,
        a.stageMessage = $message,
        a.error = $error,
        a.startedAt = coalesce(a.startedAt, $startedAt),
        a.finishedAt = $finishedAt,
        a.commitSha = coalesce($commitSha, a.commitSha)
    `,
    {
      params: {
        id: analysisId,
        status: update.status,
        stage: update.stage,
        message: update.message,
        error: update.error,
        startedAt: update.status === "running" ? now : null,
        finishedAt: update.finished ? now : null,
        commitSha: update.commitSha,
      },
    },
  );
  const event: ProgressEvent = {
    status: update.status,
    stage: update.stage,
    message: update.message,
  };
  await publishProgress(analysisId, event);
}

export async function readProgress(orgId: string, analysisId: string): Promise<ProgressEvent | null> {
  const graph = await getOrgGraph(orgId);
  const rows = await queryRows<{ status: unknown; stage: unknown; stageMessage: unknown }>(
    graph,
    `
    MATCH (a:Analysis {id: $id})
    RETURN a.status AS status, a.stage AS stage, a.stageMessage AS stageMessage
    LIMIT 1
    `,
    { id: analysisId },
  );
  const row = rows[0];
  if (!row || !isAnalysisStatus(row.status)) return null;
  const stage = row.stage === null || row.stage === undefined ? null : isAnalysisStage(row.stage) ? row.stage : null;
  if (row.stage !== null && row.stage !== undefined && stage === null) return null;
  return {
    status: row.status,
    stage,
    message: typeof row.stageMessage === "string" ? row.stageMessage : "",
  };
}

export async function loadAnalysis(orgId: string, analysisId: string): Promise<StoredAnalysis | null> {
  const graph = await getOrgGraph(orgId);
  const rows = await queryRows<Record<string, unknown>>(
    graph,
    `
    MATCH (p:Project)-[:HAS_ANALYSIS]->(a:Analysis {id: $id})
    RETURN
      a.id AS id,
      a.status AS status,
      a.stage AS stage,
      a.stageMessage AS stageMessage,
      a.error AS error,
      a.commitSha AS commitSha,
      a.createdAt AS createdAt,
      a.startedAt AS startedAt,
      a.framework AS framework,
      a.importCount AS importCount,
      a.routeCount AS routeCount,
      a.coverage AS coverage,
      p.repoOwner AS owner,
      p.repoName AS name
    LIMIT 1
    `,
    { id: analysisId },
  );
  const row = rows[0];
  if (!row || typeof row.id !== "string" || !isAnalysisStatus(row.status)) return null;
  if (typeof row.owner !== "string" || typeof row.name !== "string" || typeof row.createdAt !== "string") {
    return null;
  }
  const stage = row.stage === null || row.stage === undefined ? null : isAnalysisStage(row.stage) ? row.stage : null;
  return {
    id: row.id,
    status: row.status,
    stage,
    stageMessage: typeof row.stageMessage === "string" ? row.stageMessage : null,
    error: typeof row.error === "string" ? row.error : null,
    commitSha: typeof row.commitSha === "string" ? row.commitSha : null,
    createdAt: row.createdAt,
    startedAt: typeof row.startedAt === "string" ? row.startedAt : null,
    owner: row.owner,
    name: row.name,
    framework: typeof row.framework === "string" ? row.framework : null,
    importCount: asNumber(row.importCount) ?? 0,
    routeCount: asNumber(row.routeCount) ?? 0,
    coverage: toCoverage(row.coverage),
  };
}

export async function loadMap(
  orgId: string,
  analysisId: string,
): Promise<{ files: DetailFile[]; edges: MapEdge[]; routes: MapRoute[] }> {
  const graph = await getOrgGraph(orgId);
  const fileRows = await queryRows<Record<string, unknown>>(
    graph,
    `
    MATCH (a:Analysis {id: $id})-[:HAS_FILE]->(f:File)
    WHERE f.skipReason IS NULL
    RETURN
      f.path AS path,
      f.folder AS folder,
      f.role AS role,
      f.roleSource AS roleSource,
      f.lines AS lines,
      f.fanIn AS fanIn,
      f.fanOut AS fanOut
    `,
    { id: analysisId },
  );
  const edgeRows = await queryRows<Record<string, unknown>>(
    graph,
    `
    MATCH (a:Analysis {id: $id})-[:HAS_FILE]->(from:File)-[:IMPORTS|RE_EXPORTS|DYNAMIC_IMPORT|REQUIRES]->(to:File)<-[:HAS_FILE]-(a)
    RETURN from.path AS fromPath, to.path AS toPath
    `,
    { id: analysisId },
  );
  const files: DetailFile[] = [];
  for (const row of fileRows) {
    if (typeof row.path !== "string" || typeof row.folder !== "string") continue;
    if (typeof row.role !== "string" || typeof row.roleSource !== "string") continue;
    const lines = asNumber(row.lines);
    const fanIn = asNumber(row.fanIn);
    const fanOut = asNumber(row.fanOut);
    if (lines === null || fanIn === null || fanOut === null) continue;
    files.push({ path: row.path, folder: row.folder, role: row.role, roleSource: row.roleSource, lines, fanIn, fanOut });
  }
  const edges: MapEdge[] = [];
  for (const row of edgeRows) {
    if (typeof row.fromPath !== "string" || typeof row.toPath !== "string") continue;
    edges.push({ from: row.fromPath, to: row.toPath });
  }
  const routeRows = await queryRows<Record<string, unknown>>(
    graph,
    `
    MATCH (a:Analysis {id: $id})-[:HAS_ROUTE]->(r:Route)-[:DEFINED_IN]->(f:File)
    RETURN r.method AS method, r.path AS pattern, f.path AS file, r.line AS line
    `,
    { id: analysisId },
  );
  const routes: MapRoute[] = [];
  for (const row of routeRows) {
    const line = asNumber(row.line);
    if (typeof row.method !== "string" || typeof row.pattern !== "string" || typeof row.file !== "string") continue;
    if (line === null) continue;
    routes.push({ method: row.method, pattern: row.pattern, file: row.file, line });
  }
  routes.sort(
    (left, right) =>
      left.pattern.localeCompare(right.pattern) ||
      left.method.localeCompare(right.method) ||
      left.file.localeCompare(right.file) ||
      left.line - right.line,
  );
  return { files, edges, routes };
}

export async function storeParseResult(
  orgId: string,
  analysisId: string,
  commitSha: string,
  result: ParseResult,
): Promise<void> {
  const graph = await getOrgGraph(orgId);
  const files = [
    ...result.files.map((file) => ({
      id: fileId(analysisId, file.path),
      path: file.path,
      folder: file.folder,
      module: file.module,
      lines: file.lines,
      bytes: file.bytes,
      hash: file.hash,
      fanIn: file.fanIn,
      fanOut: file.fanOut,
      role: file.role,
      roleSource: file.roleSource,
      exports: file.exports,
      skipReason: null,
      skipDetail: null,
    })),
    ...result.skipped.map((file) => ({
      id: fileId(analysisId, file.path),
      path: file.path,
      folder: file.folder,
      module: "",
      lines: 0,
      bytes: 0,
      hash: "",
      fanIn: 0,
      fanOut: 0,
      role: "",
      roleSource: "",
      exports: [],
      skipReason: file.reason,
      skipDetail: file.detail,
    })),
  ];
  for (const batch of chunks(files, FILE_BATCH)) {
    await graph.query(
      `
      MATCH (a:Analysis {id: $analysisId})
      UNWIND $files AS file
      MERGE (f:File {id: file.id})
      SET f.path = file.path,
          f.folder = file.folder,
          f.module = file.module,
          f.lines = file.lines,
          f.bytes = file.bytes,
          f.hash = file.hash,
          f.fanIn = file.fanIn,
          f.fanOut = file.fanOut,
          f.role = file.role,
          f.roleSource = file.roleSource,
          f.exports = file.exports,
          f.skipReason = file.skipReason,
          f.skipDetail = file.skipDetail
      MERGE (a)-[:HAS_FILE]->(f)
      `,
      { params: { analysisId, files: batch } },
    );
  }

  const byKind = new Map<EdgeKind, { fromId: string; toId: string; specifier: string; line: number; typeOnly: boolean }[]>();
  for (const edge of result.edges) {
    const list = byKind.get(edge.kind) ?? [];
    list.push({
      fromId: fileId(analysisId, edge.from),
      toId: fileId(analysisId, edge.to),
      specifier: edge.specifier,
      line: edge.line,
      typeOnly: edge.typeOnly,
    });
    byKind.set(edge.kind, list);
  }
  for (const [kind, edges] of byKind) {
    for (const batch of chunks(edges, FILE_BATCH)) {
      await graph.query(edgeWrite(kind), { params: { edges: batch } });
    }
  }

  await graph.query(
    `
    MATCH (a:Analysis {id: $analysisId})-[:HAS_ROUTE]->(r:Route)
    DETACH DELETE r
    `,
    { params: { analysisId } },
  );
  const routes = result.routes.map((route) => ({
    id: `${analysisId}:${route.file}:${route.method}:${route.pattern}:${route.line}`,
    fileId: fileId(analysisId, route.file),
    method: route.method,
    pattern: route.pattern,
    line: route.line,
  }));
  for (const batch of chunks(routes, FILE_BATCH)) {
    await graph.query(
      `
      MATCH (a:Analysis {id: $analysisId})
      UNWIND $routes AS route
      MATCH (f:File {id: route.fileId})
      MERGE (r:Route {id: route.id})
      SET r.method = route.method, r.path = route.pattern, r.line = route.line
      MERGE (a)-[:HAS_ROUTE]->(r)
      MERGE (r)-[:DEFINED_IN]->(f)
      `,
      { params: { analysisId, routes: batch } },
    );
  }

  await graph.query(
    `
    MATCH (a:Analysis {id: $analysisId})
    SET a.commitSha = $commitSha,
        a.coverage = $coverage,
        a.framework = $framework,
        a.importCount = $importCount,
        a.routeCount = $routeCount
    `,
    {
      params: {
        analysisId,
        commitSha,
        coverage: JSON.stringify(result.coverage),
        framework: result.adapter.framework,
        importCount: result.coverage.importsSeen,
        routeCount: result.routes.length,
      },
    },
  );
}

function fileId(analysisId: string, filePath: string): string {
  return `${analysisId}:${filePath}`;
}

function edgeWrite(kind: EdgeKind): string {
  switch (kind) {
    case "IMPORTS":
      return `
        UNWIND $edges AS edge
        MATCH (from:File {id: edge.fromId}), (to:File {id: edge.toId})
        MERGE (from)-[r:IMPORTS]->(to)
        SET r.specifier = edge.specifier, r.line = edge.line, r.typeOnly = edge.typeOnly
      `;
    case "RE_EXPORTS":
      return `
        UNWIND $edges AS edge
        MATCH (from:File {id: edge.fromId}), (to:File {id: edge.toId})
        MERGE (from)-[r:RE_EXPORTS]->(to)
        SET r.specifier = edge.specifier, r.line = edge.line, r.typeOnly = edge.typeOnly
      `;
    case "DYNAMIC_IMPORT":
      return `
        UNWIND $edges AS edge
        MATCH (from:File {id: edge.fromId}), (to:File {id: edge.toId})
        MERGE (from)-[r:DYNAMIC_IMPORT]->(to)
        SET r.specifier = edge.specifier, r.line = edge.line, r.typeOnly = edge.typeOnly
      `;
    case "REQUIRES":
      return `
        UNWIND $edges AS edge
        MATCH (from:File {id: edge.fromId}), (to:File {id: edge.toId})
        MERGE (from)-[r:REQUIRES]->(to)
        SET r.specifier = edge.specifier, r.line = edge.line, r.typeOnly = edge.typeOnly
      `;
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function toCoverage(value: unknown): MapCoverage | null {
  if (typeof value !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  const filesFound = asNumber(record.filesFound);
  const filesParsed = asNumber(record.filesParsed);
  const filesSkipped = asNumber(record.filesSkipped);
  const importsUnresolved = asNumber(record.importsUnresolved);
  const reexportsUnresolved = asNumber(record.reexportsUnresolved);
  if (
    filesFound === null ||
    filesParsed === null ||
    filesSkipped === null ||
    importsUnresolved === null ||
    reexportsUnresolved === null
  ) {
    return null;
  }
  const failures = Array.isArray(record.failures) ? record.failures.length : 0;
  return { filesFound, filesParsed, filesSkipped, importsUnresolved, reexportsUnresolved, failures };
}
