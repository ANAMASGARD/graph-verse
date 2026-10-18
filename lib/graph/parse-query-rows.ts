export type TabularGraphData = Array<
  string | number | null | Array<string | number | null>
>;

type TabularGraphReply = {
  headers?: string[];
  data?: TabularGraphData;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Maps FalkorDB tabular query results to plain objects keyed by column header. */
export function parseQueryRows<T extends Record<string, unknown>>(
  reply: TabularGraphReply,
): T[] {
  if (!reply.data?.length) {
    return [];
  }

  const first = reply.data[0];
  if (isRecord(first)) {
    return reply.data.filter(isRecord) as unknown as T[];
  }

  if (!reply.headers?.length) {
    return [];
  }

  const { headers } = reply;
  return reply.data.map((row) => {
    const cells = Array.isArray(row) ? row : [row];
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? null;
    });
    return record as T;
  });
}
