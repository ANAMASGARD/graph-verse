/**
 * Seeds demo analyses into two Clerk organization graphs (phase 2 acceptance).
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-dev-graphs.mjs --from-env
 *   node --env-file=.env.local scripts/seed-dev-graphs.mjs <org_a> <org_b>
 *
 * Required env: FalkorDB connection vars (same as verify:falkordb).
 * Org ids: GRAPH_VERSE_SEED_ORG_A and GRAPH_VERSE_SEED_ORG_B, or two CLI args.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { connectFalkorDb } from "./falkordb-connect.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveOrgPair(argv) {
  if (argv.includes("--from-env")) {
    const a = process.env.GRAPH_VERSE_SEED_ORG_A?.trim();
    const b = process.env.GRAPH_VERSE_SEED_ORG_B?.trim();
    if (!a || !b) {
      throw new Error(
        "Set GRAPH_VERSE_SEED_ORG_A and GRAPH_VERSE_SEED_ORG_B in .env.local (Clerk organization ids).",
      );
    }
    return { orgA: a, orgB: b };
  }
  const ids = argv.filter((a) => !a.startsWith("-"));
  if (ids.length < 2) {
    throw new Error("Pass two organization ids or use --from-env.");
  }
  return { orgA: ids[0], orgB: ids[1] };
}

const SCHEMA_VERSION = 2;

async function seedOrgA(graph) {
  const now = new Date().toISOString();

  await graph.query(
    `
    MERGE (p:Project {id: $projectCompleteId})
    SET p.repoOwner = $ownerComplete,
        p.repoName = $nameComplete,
        p.createdAt = $createdAt
    MERGE (a:Analysis {id: $analysisCompleteId})
    SET a.status = 'complete',
        a.stage = 'store',
        a.stageMessage = 'Stored graph',
        a.commitSha = 'a1b2c3d',
        a.coverage = $coverageComplete,
        a.error = null,
        a.createdAt = $createdAt,
        a.startedAt = $createdAt,
        a.finishedAt = $finishedAt,
        a.schemaVersion = $schemaVersion
    MERGE (p)-[:HAS_ANALYSIS]->(a)
    MERGE (f1:File {id: $fileMainId})
    SET f1.path = 'src/index.ts',
        f1.module = 'esm',
        f1.lines = 120,
        f1.bytes = 3400,
        f1.hash = 'hash-main',
        f1.fanIn = 0,
        f1.fanOut = 1,
        f1.skipReason = null,
        f1.skipDetail = null,
        f1.role = 'entry',
        f1.roleSource = 'convention'
    MERGE (f2:File {id: $fileUtilId})
    SET f2.path = 'src/util.ts',
        f2.module = 'esm',
        f2.lines = 40,
        f2.bytes = 900,
        f2.hash = 'hash-util',
        f2.fanIn = 1,
        f2.fanOut = 0,
        f2.skipReason = null,
        f2.skipDetail = null,
        f2.role = null,
        f2.roleSource = null
    MERGE (a)-[:HAS_FILE]->(f1)
    MERGE (a)-[:HAS_FILE]->(f2)
    MERGE (f1)-[e:IMPORTS]->(f2)
    SET e.specifier = './util',
        e.line = 3,
        e.typeOnly = false
    MERGE (r:Route {id: $routeId})
    SET r.method = 'GET',
        r.path = '/api/health',
        r.line = 12
    MERGE (a)-[:HAS_ROUTE]->(r)
    MERGE (r)-[:DEFINED_IN]->(f1)
    MERGE (i:Insight {id: $insightId})
    SET i.body = 'Entry file re-exports the util module.',
        i.createdAt = $createdAt
    MERGE (a)-[:HAS_INSIGHT]->(i)
    `,
    {
      params: {
        projectCompleteId: "11111111-1111-4111-8111-111111111101",
        analysisCompleteId: "22222222-2222-4222-8222-222222222201",
        ownerComplete: "vercel",
        nameComplete: "next.js",
        createdAt: now,
        finishedAt: now,
        coverageComplete: JSON.stringify({
          parsed: 2,
          skipped: 0,
          total: 2,
        }),
        schemaVersion: SCHEMA_VERSION,
        fileMainId: "33333333-3333-4333-8333-333333333301",
        fileUtilId: "44444444-4444-4444-8444-444444444401",
        routeId: "55555555-5555-4555-8555-555555555501",
        insightId: "66666666-6666-4666-8666-666666666601",
      },
    },
  );

  await graph.query(
    `
    MERGE (p:Project {id: $projectRunningId})
    SET p.repoOwner = $ownerRunning,
        p.repoName = $nameRunning,
        p.createdAt = $createdAt
    MERGE (a:Analysis {id: $analysisRunningId})
    SET a.status = 'running',
        a.stage = 'parse',
        a.stageMessage = 'Parsing TypeScript sources',
        a.commitSha = null,
        a.coverage = null,
        a.error = null,
        a.createdAt = $createdAt,
        a.startedAt = $startedAt,
        a.finishedAt = null,
        a.schemaVersion = null
    MERGE (p)-[:HAS_ANALYSIS]->(a)
    `,
    {
      params: {
        projectRunningId: "11111111-1111-4111-8111-111111111102",
        analysisRunningId: "22222222-2222-4222-8222-222222222202",
        ownerRunning: "facebook",
        nameRunning: "react",
        createdAt: now,
        startedAt: now,
      },
    },
  );
}

async function seedOrgB(graph) {
  const now = new Date().toISOString();

  await graph.query(
    `
    MERGE (p:Project {id: $projectFailedId})
    SET p.repoOwner = $owner,
        p.repoName = $name,
        p.createdAt = $createdAt
    MERGE (a:Analysis {id: $analysisFailedId})
    SET a.status = 'failed',
        a.stage = 'fetch',
        a.stageMessage = 'Repository not found',
        a.commitSha = null,
        a.coverage = null,
        a.error = 'HTTP 404',
        a.createdAt = $createdAt,
        a.startedAt = $startedAt,
        a.finishedAt = $finishedAt,
        a.schemaVersion = null
    MERGE (p)-[:HAS_ANALYSIS]->(a)
    MERGE (f:File {id: $skippedFileId})
    SET f.path = 'legacy/vendor.js',
        f.skipReason = 'unsupported',
        f.skipDetail = 'Not included in public clone',
        f.module = null,
        f.lines = null,
        f.bytes = null,
        f.hash = null,
        f.fanIn = null,
        f.fanOut = null,
        f.role = null,
        f.roleSource = null
    MERGE (a)-[:HAS_FILE]->(f)
    `,
    {
      params: {
        projectFailedId: "11111111-1111-4111-8111-111111111201",
        analysisFailedId: "22222222-2222-4222-8222-222222222201",
        owner: "adrianhajdin",
        name: "cartograph",
        createdAt: now,
        startedAt: now,
        finishedAt: now,
        skippedFileId: "33333333-3333-4333-8333-333333333201",
      },
    },
  );
}

const { orgA, orgB } = resolveOrgPair(process.argv.slice(2));

const apply = spawnSync(
  process.execPath,
  [join(__dirname, "apply-graph-schema.mjs"), orgA, orgB],
  { stdio: "inherit", cwd: join(__dirname, ".."), env: process.env },
);
if (apply.status !== 0) {
  process.exit(apply.status ?? 1);
}

const db = await connectFalkorDb();

console.log(`Seeding org A graph ${orgA}…`);
await seedOrgA(db.selectGraph(orgA));

console.log(`Seeding org B graph ${orgB}…`);
await seedOrgB(db.selectGraph(orgB));

await db.close();
console.log("Seed complete.");
