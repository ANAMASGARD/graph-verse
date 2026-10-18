import "server-only";

import type { Graph } from "falkordb";
import { getFalkorDbClient } from "@/lib/falkordb-client";

/** Opens the FalkorDB graph named by the Clerk organization id from the session token. */
export async function getOrgGraph(orgId: string): Promise<Graph> {
  const trimmed = orgId.trim();
  if (!trimmed) {
    throw new Error("Organization id is required to select a FalkorDB graph.");
  }
  const db = await getFalkorDbClient();
  return db.selectGraph(trimmed);
}
