import "server-only";

import { getOrgGraph } from "@/lib/falkordb-org-graph";
import { parseQueryRows, type TabularGraphData } from "@/lib/graph/parse-query-rows";
import type { Cache, Task } from "@/lib/ai/tasks";

type Graph = Awaited<ReturnType<typeof getOrgGraph>>;

type QueryReply = {
  headers?: string[];
  data?: TabularGraphData;
};

type CypherParams = { [key: string]: null | string | number | boolean | CypherParams[] | { [key: string]: CypherParams } };

async function queryRows<T extends Record<string, unknown>>(
  graph: Graph,
  cypher: string,
  params: CypherParams,
): Promise<T[]> {
  const reply = (await graph.query(cypher, { params })) as QueryReply;
  return parseQueryRows<T>(reply);
}

export function orgAiCache(orgId: string): Cache {
  return {
    read: (key) => readAiCache(orgId, key),
    write: (entry) => writeAiCache(orgId, entry),
  };
}

async function readAiCache(orgId: string, key: string): Promise<string | null> {
  const graph = await getOrgGraph(orgId);
  const rows = await queryRows<{ body: unknown }>(
    graph,
    `
    MATCH (c:AiCache {key: $key})
    RETURN c.body AS body
    LIMIT 1
    `,
    { key },
  );
  const body = rows[0]?.body;
  return typeof body === "string" ? body : null;
}

async function writeAiCache(
  orgId: string,
  entry: { key: string; task: Task; model: string; body: string },
): Promise<void> {
  const graph = await getOrgGraph(orgId);
  const now = new Date().toISOString();
  await graph.query(
    `
    MERGE (c:AiCache {key: $key})
    ON CREATE SET c.createdAt = $now
    SET c.task = $task,
        c.model = $model,
        c.body = $body
    `,
    {
      params: {
        key: entry.key,
        task: entry.task,
        model: entry.model,
        body: entry.body,
        now,
      },
    },
  );
}
