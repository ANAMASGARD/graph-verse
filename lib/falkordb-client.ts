import "server-only";

import { getFalkorDbConfig } from "@/lib/falkordb-config";

type FalkorDBClient = import("falkordb").FalkorDB;

let clientPromise: Promise<FalkorDBClient> | null = null;

/** Shared FalkorDB client. Call `getOrgGraph(orgId)` before reads or writes. */
export function getFalkorDbClient(): Promise<FalkorDBClient> {
  if (!clientPromise) {
    clientPromise = connectFalkorDb();
  }
  return clientPromise;
}

async function connectFalkorDb(): Promise<FalkorDBClient> {
  const { FalkorDB } = await import("falkordb");
  const config = getFalkorDbConfig();

  const db = await FalkorDB.connect({
    socket: {
      host: config.host,
      port: config.port,
      ...(config.tls
        ? {
            tls: true,
            rejectUnauthorized: true,
          }
        : {}),
    },
    username: config.username,
    password: config.password,
  });

  const connection = await db.connection;
  const ping = await connection.ping();
  if (ping !== "PONG") {
    await db.close();
    throw new Error(`FalkorDB ping failed (expected PONG, got ${String(ping)}).`);
  }

  return db;
}

/** Confirms the cloud/local instance is reachable. Used at server startup. */
export async function assertFalkorDbReachable(): Promise<void> {
  const db = await getFalkorDbClient();
  const connection = await db.connection;
  const ping = await connection.ping();
  if (ping !== "PONG") {
    throw new Error(`FalkorDB ping failed (expected PONG, got ${String(ping)}).`);
  }
}
