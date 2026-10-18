import "server-only";

import { randomUUID } from "node:crypto";

import { getOrgGraph } from "@/lib/falkordb-org-graph";

export async function recordInquiry(
  orgId: string,
  analysisId: string,
  question: string,
  paths: readonly string[],
  threadId: string,
): Promise<void> {
  const graph = await getOrgGraph(orgId);
  await graph.query(
    `
    MATCH (a:Analysis {id: $analysisId})
    CREATE (q:Inquiry {
      id: $id,
      question: $question,
      paths: $paths,
      threadId: $threadId,
      createdAt: $now
    })
    CREATE (a)-[:HAS_INQUIRY]->(q)
    `,
    {
      params: {
        analysisId,
        id: randomUUID(),
        question,
        paths: [...new Set(paths)],
        threadId,
        now: new Date().toISOString(),
      },
    },
  );
}
