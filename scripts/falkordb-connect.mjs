import { FalkorDB } from "falkordb";

const required = [
  "FALKORDB_HOST",
  "FALKORDB_PORT",
  "FALKORDB_USERNAME",
  "FALKORDB_PASSWORD",
];

export function assertFalkorEnv() {
  const missing = required.filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    throw new Error(`Missing FalkorDB env: ${missing.join(", ")}`);
  }
}

/** @returns {Promise<import('falkordb').FalkorDB>} */
export async function connectFalkorDb() {
  assertFalkorEnv();
  const port = Number(process.env.FALKORDB_PORT);
  const tls = process.env.FALKORDB_TLS?.trim().toLowerCase() === "true";

  return FalkorDB.connect({
    socket: {
      host: process.env.FALKORDB_HOST.trim(),
      port,
      ...(tls ? { tls: true, rejectUnauthorized: true } : {}),
    },
    username: process.env.FALKORDB_USERNAME.trim(),
    password: process.env.FALKORDB_PASSWORD,
  });
}
