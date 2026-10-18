import "server-only";

import { getOrgGraph } from "@/lib/falkordb-org-graph";
import { parseQueryRows, type TabularGraphData } from "@/lib/graph/parse-query-rows";

const SEARCH_LIMIT = 40;
const LIST_LIMIT = 80;
const WALK_DEPTH = 2;

export type ToolResult = { text: string; paths: string[] };

type Graph = Awaited<ReturnType<typeof getOrgGraph>>;

type QueryReply = { headers?: string[]; data?: TabularGraphData };

type CypherParams = { [key: string]: string | number };

const EDGE = "IMPORTS|RE_EXPORTS|DYNAMIC_IMPORT|REQUIRES";

export async function runTool(
  orgId: string,
  analysisId: string,
  input: { [key: string]: unknown },
): Promise<ToolResult> {
  const name = input.name;
  if (typeof name !== "string") return { text: "The tool name was missing.", paths: [] };
  const graph = await getOrgGraph(orgId);
  switch (name) {
    case "summary":
      return summary(graph, analysisId);
    case "search":
      return search(graph, analysisId, stringField(input, "part"));
    case "role":
      return role(graph, analysisId, stringField(input, "role"));
    case "neighbours":
      return neighbours(graph, analysisId, stringField(input, "path"));
    case "walk":
      return walk(graph, analysisId, stringField(input, "path"), stringField(input, "direction"), optionalField(input, "to"));
    case "routes":
      return routes(graph, analysisId);
    default:
      return { text: `There is no tool named ${name}.`, paths: [] };
  }
}

async function summary(graph: Graph, analysisId: string): Promise<ToolResult> {
  const rows = await query<{ owner: unknown; name: unknown; framework: unknown; importCount: unknown; routeCount: unknown }>(
    graph,
    `
    MATCH (p:Project)-[:HAS_ANALYSIS]->(a:Analysis {id: $id})
    RETURN p.repoOwner AS owner, p.repoName AS name, a.framework AS framework,
           a.importCount AS importCount, a.routeCount AS routeCount
    `,
    { id: analysisId },
  );
  const row = rows[0];
  if (!row || typeof row.owner !== "string" || typeof row.name !== "string") {
    return { text: "This analysis has no repository.", paths: [] };
  }
  const counted = await query<{ files: unknown }>(
    graph,
    `
    MATCH (a:Analysis {id: $id})-[:HAS_FILE]->(f:File)
    WHERE f.skipReason IS NULL
    RETURN count(f) AS files
    `,
    { id: analysisId },
  );
  const roles = await query<{ role: unknown; n: unknown }>(
    graph,
    `
    MATCH (a:Analysis {id: $id})-[:HAS_FILE]->(f:File)
    WHERE f.skipReason IS NULL AND f.role <> ''
    RETURN f.role AS role, count(f) AS n
    ORDER BY n DESC, role
    `,
    { id: analysisId },
  );
  const roleLines = roles.flatMap((entry) =>
    typeof entry.role === "string" ? [`${entry.role}: ${asNumber(entry.n)}`] : [],
  );
  const text = [
    `${row.owner}/${row.name}`,
    `Framework: ${typeof row.framework === "string" ? row.framework : "none"}`,
    `Files: ${asNumber(counted[0]?.files)}`,
    `Imports: ${asNumber(row.importCount)}`,
    `Routes: ${asNumber(row.routeCount)}`,
    roleLines.length ? `Roles:\n${roleLines.join("\n")}` : "Roles: none",
  ].join("\n");
  return { text, paths: [] };
}

async function search(graph: Graph, analysisId: string, part: string | null): Promise<ToolResult> {
  if (!part) return { text: "Search needs a path fragment.", paths: [] };
  const rows = await query<{ path: unknown; role: unknown }>(
    graph,
    `
    MATCH (a:Analysis {id: $id})-[:HAS_FILE]->(f:File)
    WHERE f.skipReason IS NULL AND toLower(f.path) CONTAINS toLower($part)
    RETURN f.path AS path, f.role AS role
    ORDER BY f.path
    LIMIT ${SEARCH_LIMIT}
    `,
    { id: analysisId, part },
  );
  return listed("No file path contains that fragment.", rows);
}

async function role(graph: Graph, analysisId: string, roleName: string | null): Promise<ToolResult> {
  if (!roleName) return { text: "A role name is required.", paths: [] };
  const rows = await query<{ path: unknown; role: unknown }>(
    graph,
    `
    MATCH (a:Analysis {id: $id})-[:HAS_FILE]->(f:File)
    WHERE f.skipReason IS NULL AND toLower(f.role) = toLower($role)
    RETURN f.path AS path, f.role AS role
    ORDER BY f.path
    LIMIT ${LIST_LIMIT}
    `,
    { id: analysisId, role: roleName },
  );
  return listed(`No files have the role ${roleName}.`, rows);
}

async function neighbours(graph: Graph, analysisId: string, path: string | null): Promise<ToolResult> {
  if (!path) return { text: "A file path is required.", paths: [] };
  const exists = await fileExists(graph, analysisId, path);
  if (!exists) return { text: `${path} is not a file in this analysis.`, paths: [] };
  const outgoing = await query<{ path: unknown; kind: unknown }>(
    graph,
    `
    MATCH (a:Analysis {id: $id})-[:HAS_FILE]->(f:File {path: $path})-[r:${EDGE}]->(other:File)
    RETURN other.path AS path, type(r) AS kind
    ORDER BY other.path
    `,
    { id: analysisId, path },
  );
  const incoming = await query<{ path: unknown; kind: unknown }>(
    graph,
    `
    MATCH (a:Analysis {id: $id})-[:HAS_FILE]->(other:File)-[r:${EDGE}]->(f:File {path: $path})
    RETURN other.path AS path, type(r) AS kind
    ORDER BY other.path
    `,
    { id: analysisId, path },
  );
  const paths = unique([...pathsOf(outgoing), ...pathsOf(incoming)]);
  const line = (row: { path: unknown; kind: unknown }) =>
    typeof row.path === "string" ? `- ${row.path}${typeof row.kind === "string" ? ` (${row.kind})` : ""}` : null;
  const text = [
    `${path} imports:`,
    ...(outgoing.map(line).filter((entry): entry is string => entry !== null).length
      ? outgoing.map(line).filter((entry): entry is string => entry !== null)
      : ["- none"]),
    "Imported by:",
    ...(incoming.map(line).filter((entry): entry is string => entry !== null).length
      ? incoming.map(line).filter((entry): entry is string => entry !== null)
      : ["- none"]),
  ].join("\n");
  return { text, paths };
}

async function walk(
  graph: Graph,
  analysisId: string,
  path: string | null,
  direction: string | null,
  to: string | null,
): Promise<ToolResult> {
  if (!path) return { text: "A file path is required.", paths: [] };
  if (direction !== "in" && direction !== "out") return { text: "Direction must be in or out.", paths: [] };
  if (!(await fileExists(graph, analysisId, path))) return { text: `${path} is not a file in this analysis.`, paths: [] };
  if (to) {
    if (!(await fileExists(graph, analysisId, to))) return { text: `${to} is not a file in this analysis.`, paths: [] };
    return chain(graph, analysisId, path, to, direction);
  }
  const pattern =
    direction === "out"
      ? `(start)-[:${EDGE}*1..${WALK_DEPTH}]->(other)`
      : `(other)-[:${EDGE}*1..${WALK_DEPTH}]->(start)`;
  const rows = await query<{ path: unknown; depth: unknown }>(
    graph,
    `
    MATCH (a:Analysis {id: $id})-[:HAS_FILE]->(start:File {path: $path})
    MATCH p = ${pattern}
    WHERE other <> start
    RETURN other.path AS path, length(p) AS depth
    ORDER BY depth, path
    `,
    { id: analysisId, path },
  );
  const seen = new Set<string>();
  const lines: string[] = [];
  const paths: string[] = [];
  for (const row of rows) {
    if (typeof row.path !== "string" || seen.has(row.path)) continue;
    seen.add(row.path);
    paths.push(row.path);
    lines.push(`- ${row.path} (${typeof row.depth === "number" ? row.depth : "?"} hops)`);
  }
  const heading = direction === "in" ? `Files that depend on ${path}, within ${WALK_DEPTH} hops:` : `Files ${path} depends on, within ${WALK_DEPTH} hops:`;
  return { text: [heading, ...(lines.length ? lines : ["- none"])].join("\n"), paths };
}

async function chain(
  graph: Graph,
  analysisId: string,
  from: string,
  to: string,
  direction: "in" | "out",
): Promise<ToolResult> {
  const pattern =
    direction === "out"
      ? `(start)-[:${EDGE}*1..${WALK_DEPTH}]->(goal)`
      : `(goal)-[:${EDGE}*1..${WALK_DEPTH}]->(start)`;
  const rows = await query<{ paths: unknown }>(
    graph,
    `
    MATCH (a:Analysis {id: $id})-[:HAS_FILE]->(start:File {path: $from})
    MATCH (a)-[:HAS_FILE]->(goal:File {path: $to})
    RETURN [n IN nodes(shortestPath(${pattern})) | n.path] AS paths
    `,
    { id: analysisId, from, to },
  );
  const chainPaths = stringArray(rows[0]?.paths);
  if (!chainPaths || chainPaths.length === 0) {
    return { text: `No chain of at most ${WALK_DEPTH} hops from ${from} to ${to} in direction ${direction}.`, paths: [] };
  }
  return { text: chainPaths.join(" → "), paths: chainPaths.filter((entry) => entry !== from) };
}

async function routes(graph: Graph, analysisId: string): Promise<ToolResult> {
  const rows = await query<{ method: unknown; pattern: unknown; path: unknown; line: unknown }>(
    graph,
    `
    MATCH (a:Analysis {id: $id})-[:HAS_ROUTE]->(r:Route)-[:DEFINED_IN]->(f:File)
    RETURN r.method AS method, r.path AS pattern, f.path AS path, r.line AS line
    ORDER BY pattern, method, path
    LIMIT ${LIST_LIMIT}
    `,
    { id: analysisId },
  );
  const paths: string[] = [];
  const lines: string[] = [];
  for (const row of rows) {
    if (typeof row.path !== "string" || typeof row.method !== "string" || typeof row.pattern !== "string") continue;
    paths.push(row.path);
    const line = typeof row.line === "number" ? `:${row.line}` : "";
    lines.push(`- ${row.method} ${row.pattern} ${row.path}${line}`);
  }
  return { text: ["Routes:", ...(lines.length ? lines : ["- none"])].join("\n"), paths: unique(paths) };
}

async function fileExists(graph: Graph, analysisId: string, path: string): Promise<boolean> {
  const rows = await query<{ path: unknown }>(
    graph,
    `
    MATCH (a:Analysis {id: $id})-[:HAS_FILE]->(f:File {path: $path})
    WHERE f.skipReason IS NULL
    RETURN f.path AS path
    LIMIT 1
    `,
    { id: analysisId, path },
  );
  return rows.length > 0;
}

function listed(empty: string, rows: readonly { path: unknown; role: unknown }[]): ToolResult {
  const paths = pathsOf(rows);
  if (paths.length === 0) return { text: empty, paths: [] };
  const lines = rows
    .filter((row): row is { path: string; role: unknown } => typeof row.path === "string")
    .map((row) => `- ${row.path}${typeof row.role === "string" && row.role ? ` (${row.role})` : ""}`);
  return { text: lines.join("\n"), paths };
}

function pathsOf(rows: readonly { path: unknown }[]): string[] {
  return unique(rows.flatMap((row) => (typeof row.path === "string" ? [row.path] : [])));
}

function unique(paths: readonly string[]): string[] {
  return [...new Set(paths)];
}

function stringField(input: { [key: string]: unknown }, key: string): string | null {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalField(input: { [key: string]: unknown }, key: string): string | null {
  return stringField(input, key);
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) return null;
  return value;
}

async function query<T extends Record<string, unknown>>(graph: Graph, cypher: string, params: CypherParams): Promise<T[]> {
  const reply = (await graph.query(cypher, { params })) as QueryReply;
  return parseQueryRows<T>(reply);
}
