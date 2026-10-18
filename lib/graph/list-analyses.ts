import "server-only";

import {
  parseQueryRows,
  type TabularGraphData,
} from "@/lib/graph/parse-query-rows";
import {
  isAnalysisStage,
  isAnalysisStatus,
  type AnalysisListItem,
} from "@/lib/graph/analysis-types";
import { getOrgGraph } from "@/lib/falkordb-org-graph";

/** Lists analyses in the active organization graph. Tenancy is the graph name only. */
export const LIST_ANALYSES_CYPHER = `
MATCH (p:Project)-[:HAS_ANALYSIS]->(a:Analysis)
RETURN
  a.id AS id,
  a.status AS status,
  a.stage AS stage,
  a.stageMessage AS stageMessage,
  a.commitSha AS commitSha,
  a.createdAt AS createdAt,
  a.startedAt AS startedAt,
  a.finishedAt AS finishedAt,
  p.repoOwner AS repoOwner,
  p.repoName AS repoName
ORDER BY a.createdAt DESC
`;

type RawAnalysisRow = {
  id: unknown;
  status: unknown;
  stage: unknown;
  stageMessage: unknown;
  commitSha: unknown;
  createdAt: unknown;
  startedAt: unknown;
  finishedAt: unknown;
  repoOwner: unknown;
  repoName: unknown;
};

function toAnalysisListItem(row: RawAnalysisRow): AnalysisListItem | null {
  if (typeof row.id !== "string") {
    return null;
  }
  if (!isAnalysisStatus(row.status)) {
    return null;
  }
  if (typeof row.repoOwner !== "string" || typeof row.repoName !== "string") {
    return null;
  }
  if (typeof row.createdAt !== "string") {
    return null;
  }

  const stage =
    row.stage === null || row.stage === undefined
      ? null
      : isAnalysisStage(row.stage)
        ? row.stage
        : null;

  return {
    id: row.id,
    status: row.status,
    stage,
    stageMessage: typeof row.stageMessage === "string" ? row.stageMessage : null,
    commitSha: typeof row.commitSha === "string" ? row.commitSha : null,
    createdAt: row.createdAt,
    startedAt: typeof row.startedAt === "string" ? row.startedAt : null,
    finishedAt: typeof row.finishedAt === "string" ? row.finishedAt : null,
    repoOwner: row.repoOwner,
    repoName: row.repoName,
  };
}

export async function listAnalysesForOrg(orgId: string): Promise<AnalysisListItem[]> {
  const graph = await getOrgGraph(orgId);
  const reply = await graph.roQuery(LIST_ANALYSES_CYPHER);
  const raw = reply as {
    headers?: string[];
    data?: TabularGraphData;
  };
  const rows = parseQueryRows<RawAnalysisRow>({
    headers: raw.headers,
    data: raw.data,
  });
  return rows
    .map(toAnalysisListItem)
    .filter((item): item is AnalysisListItem => item !== null);
}
