import { Client } from "langsmith";

import { loadAppEnv } from "./env.mts";
import { checkInventedPaths, pathsShownFromUnknown } from "./invented-path.mts";
import { refusedByLangSmith } from "./langsmith-error.mts";

loadAppEnv();

const PROJECT = process.env.LANGSMITH_PROJECT?.trim() || "default";
const RECENT = 30;

proveSplice();

const client = new Client();
let runs: { id?: string; name?: string; inputs?: { [key: string]: unknown }; outputs?: { [key: string]: unknown } }[];
try {
  runs = await recentExplainRuns(client);
} catch (error) {
  if (refusedByLangSmith(error)) process.exit(1);
  throw error;
}

if (runs.length === 0) {
  console.error(`No explain-file or explain-folder runs in LangSmith project ${PROJECT}.`);
  process.exit(1);
}

let scored = 0;
let clean = 0;
const failures: { name: string; id: string; where: string; invented: string[]; shown: string[] }[] = [];
for (const run of runs) {
  const shown = pathsShownFromUnknown(run.inputs);
  const body = typeof run.outputs?.body === "string" ? run.outputs.body : null;
  if (shown === null || body === null) continue;
  const check = checkInventedPaths(body, shown);
  scored += 1;
  if (check.score === 1) clean += 1;
  else {
    const inputs = run.inputs;
    const where =
      inputs !== undefined && typeof inputs.path === "string"
        ? inputs.path
        : inputs !== undefined && typeof inputs.dir === "string"
          ? inputs.dir
          : (run.id ?? "");
    failures.push({ name: run.name ?? "explain", id: run.id ?? "", where, invented: check.invented, shown });
  }
}

if (scored === 0) {
  console.error(`Found ${runs.length} explain runs in ${PROJECT}, but none carried a body and the paths it was shown.`);
  process.exit(1);
}

const percent = ((100 * clean) / scored).toFixed(1);
console.log(`Invented-path ${percent}% clean (${clean}/${scored}) in ${PROJECT}.`);
for (const failure of failures) {
  console.log(`${failure.name} ${failure.id}  ${failure.where}`);
  console.log(`  invented: ${failure.invented.join(", ")}`);
  console.log(`  shown: ${failure.shown.join(", ")}`);
}

async function recentExplainRuns(client: Client) {
  const project = await client.readProject({ projectName: PROJECT });
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const runs: { id?: string; name?: string; inputs?: { [key: string]: unknown }; outputs?: { [key: string]: unknown } }[] = [];
  for await (const run of client.runs.query({
    project_ids: [project.id],
    is_root: true,
    min_start_time: since,
    page_size: RECENT,
    filter: 'or(eq(name, "explain-file"), eq(name, "explain-folder"))',
  })) {
    if (run.name !== "explain-file" && run.name !== "explain-folder") continue;
    runs.push(run);
    if (runs.length >= RECENT) break;
  }
  return runs;
}

function proveSplice(): void {
  const shown = ["lib/ai/client.ts", "lib/ai/prompts.ts"];
  const caught = checkInventedPaths("It imports `lib/ai/prompts.ts` and also `lib/not-a-real-file.ts`.", shown);
  const clean = checkInventedPaths("It imports `lib/ai/prompts.ts`.", shown);
  const prose = checkInventedPaths("Nothing here is a file path, just **bold** and a version.", shown);
  if (caught.invented.length !== 1 || caught.invented[0] !== "lib/not-a-real-file.ts" || caught.score !== 0) {
    console.error("Splice check did not catch lib/not-a-real-file.ts.");
    process.exit(1);
  }
  if (clean.score !== 1 || prose.tokens.length !== 0) {
    console.error("Splice check flagged a path that was shown, or treated ordinary words as paths.");
    process.exit(1);
  }
  console.log("Splice check caught lib/not-a-real-file.ts.");
}
