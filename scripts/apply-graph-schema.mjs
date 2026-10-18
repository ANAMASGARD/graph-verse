/**
 * Applies db/schema/001-graph-schema.cypher to one or more organization graphs.
 *
 * Usage:
 *   node --env-file=.env.local scripts/apply-graph-schema.mjs <org_id> [org_id...]
 *   node --env-file=.env.local scripts/apply-graph-schema.mjs --from-env
 *
 * Env (with --from-env):
 *   GRAPH_VERSE_SEED_ORG_A, GRAPH_VERSE_SEED_ORG_B
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { connectFalkorDb } from "./falkordb-connect.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, "../db/schema/001-graph-schema.cypher");

function loadStatements() {
  const raw = readFileSync(schemaPath, "utf8");
  return raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function resolveOrgIds(argv) {
  if (argv.includes("--from-env")) {
    const ids = [
      process.env.GRAPH_VERSE_SEED_ORG_A?.trim(),
      process.env.GRAPH_VERSE_SEED_ORG_B?.trim(),
    ].filter(Boolean);
    if (ids.length === 0) {
      throw new Error(
        "Set GRAPH_VERSE_SEED_ORG_A and GRAPH_VERSE_SEED_ORG_B in .env.local, or pass org ids on the command line.",
      );
    }
    return ids;
  }

  const ids = argv.filter((a) => !a.startsWith("-"));
  if (ids.length === 0) {
    throw new Error(
      "Pass at least one Clerk organization id, or use --from-env.",
    );
  }
  return ids;
}

async function applyToGraph(graph, statements) {
  for (const statement of statements) {
    try {
      await graph.query(statement);
      console.log("  ok:", statement.split("\n")[0].slice(0, 72));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/exist|already/i.test(message)) {
        console.log("  skip (exists):", statement.split("\n")[0].slice(0, 60));
        continue;
      }
      throw error;
    }
  }
}

const orgIds = resolveOrgIds(process.argv.slice(2));
const statements = loadStatements();
const db = await connectFalkorDb();

for (const orgId of orgIds) {
  console.log(`Applying schema to graph ${orgId}…`);
  const graph = db.selectGraph(orgId);
  await applyToGraph(graph, statements);
}

await db.close();
console.log("Done.");
