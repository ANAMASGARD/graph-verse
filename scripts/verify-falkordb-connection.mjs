/**
 * Smoke-test FalkorDB Cloud/local credentials from .env.local (run from repo root).
 * Usage: node --env-file=.env.local scripts/verify-falkordb-connection.mjs
 */
import { FalkorDB } from "falkordb";

const required = [
  "FALKORDB_HOST",
  "FALKORDB_PORT",
  "FALKORDB_USERNAME",
  "FALKORDB_PASSWORD",
];
const missing = required.filter((k) => !process.env[k]?.trim());
if (missing.length) {
  console.error(`Missing: ${missing.join(", ")}`);
  process.exit(1);
}

const port = Number(process.env.FALKORDB_PORT);
const tls = process.env.FALKORDB_TLS?.trim().toLowerCase() === "true";

const db = await FalkorDB.connect({
  socket: {
    host: process.env.FALKORDB_HOST.trim(),
    port,
    ...(tls ? { tls: true, rejectUnauthorized: true } : {}),
  },
  username: process.env.FALKORDB_USERNAME.trim(),
  password: process.env.FALKORDB_PASSWORD,
});

const conn = await db.connection;
const ping = await conn.ping();
const graphs = await db.list();
console.log("ping:", ping);
console.log("graphs:", graphs.length ? graphs.join(", ") : "(none)");
await db.close();
