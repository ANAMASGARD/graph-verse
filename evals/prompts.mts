import path from "node:path";

import { Client } from "langsmith";
import { evaluate } from "langsmith/evaluation";
import type { EvaluationResult } from "langsmith/evaluation";

import { ai, MODELS } from "../lib/ai/client.ts";
import type { FileInput } from "../lib/ai/prompts.ts";
import { EXPLAIN_FILE_SYSTEM, explainFileMessage } from "../lib/ai/prompts.ts";
import { completePrompt } from "../lib/ai/tasks.ts";
import { parseRepository } from "../parser/parse-repository.mts";
import { loadAppEnv } from "./env.mts";
import { refusedByLangSmith } from "./langsmith-error.mts";
import { filesForEval, type EvalFile } from "./from-parse.mts";
import { checkInventedPaths, pathsShownFromUnknown } from "./invented-path.mts";
import { RETIRED_EXPLAIN_SYSTEM } from "./retired-prompt.mts";

loadAppEnv();

const DATASET = "graph-verse-explain";
const SOURCE_CAP = 24_000;
const EXAMPLE_CAP = 8;

console.log(
  `Usefulness is a model's opinion (${MODELS.classify}). "Specific enough to be useful" has no exact answer, so that number is not a measurement.`,
);
console.log("Invented-path is exact: a path-shaped token is either in the set the model was shown, or it was invented.");

try {
await runExperiments();
} catch (error) {
  if (refusedByLangSmith(error)) process.exit(1);
  throw error;
}

async function runExperiments(): Promise<void> {
const client = new Client();
const refresh = process.argv.includes("--refresh");
const directory = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const already = await client.hasDataset({ datasetName: DATASET });
if (refresh && already) await client.deleteDataset({ datasetName: DATASET });
const exists = already && !refresh;
if (!exists) {
  if (!directory) {
    console.error("Usage: npm run eval:prompts -- <directory>");
    process.exit(1);
  }
  await client.createDataset(DATASET, {
    description: "File explanations. Two prompt versions are scored on this same set.",
  });
  const examples = await datasetExamples(path.resolve(directory));
  await client.createExamples(examples.map((inputs) => ({ dataset_name: DATASET, inputs })));
  console.log(`Dataset ${DATASET}: wrote ${examples.length} examples.`);
} else {
  console.log(`Dataset ${DATASET}: reusing existing examples.`);
}

const current = await evaluate(target(EXPLAIN_FILE_SYSTEM), {
  data: DATASET,
  evaluators: [inventedPath, usefulness],
  experimentPrefix: "explain-current",
  maxConcurrency: 2,
  metadata: { prompt: "current", judge: "model opinion, not an exact measure" },
  client,
});
const retired = await evaluate(target(RETIRED_EXPLAIN_SYSTEM), {
  data: DATASET,
  evaluators: [inventedPath, usefulness],
  experimentPrefix: "explain-retired",
  maxConcurrency: 2,
  metadata: { prompt: "retired", judge: "model opinion, not an exact measure" },
  client,
});

const currentRows = await rowsOf(current);
const retiredRows = await rowsOf(retired);
const currentUseful = mean(currentRows, "useful");
const retiredUseful = mean(retiredRows, "useful");
const currentPaths = mean(currentRows, "invented_path");
const retiredPaths = mean(retiredRows, "invented_path");

console.log(`Current  ${current.experimentName}  invented-path ${currentPaths.toFixed(2)}  useful ${currentUseful.toFixed(2)}`);
console.log(`  ${await client.getProjectUrl({ projectName: current.experimentName })}`);
console.log(`Retired  ${retired.experimentName}  invented-path ${retiredPaths.toFixed(2)}  useful ${retiredUseful.toFixed(2)}`);
console.log(`  ${await client.getProjectUrl({ projectName: retired.experimentName })}`);

const delta = currentUseful - retiredUseful;
if (delta > 0) console.log(`Current is more useful by ${delta.toFixed(2)}.`);
else if (delta < 0) console.log(`Retired is more useful by ${(-delta).toFixed(2)}.`);
else console.log("The two prompts scored the same usefulness.");
}

type ExampleInputs = { file: FileInput; source: string };

function target(system: string) {
  return async (inputs: { [key: string]: unknown }) => {
    const example = exampleInputs(inputs);
    const body = await completePrompt(MODELS.explain, system, explainFileMessage(example.file, example.source));
    return { body };
  };
}

function inventedPath(args: { inputs: { [key: string]: unknown }; outputs: { [key: string]: unknown } }): EvaluationResult {
  const example = exampleInputs(args.inputs);
  const body = typeof args.outputs.body === "string" ? args.outputs.body : "";
  const shown = pathsShownFromUnknown(example.file) ?? [];
  const check = checkInventedPaths(body, shown);
  return {
    key: "invented_path",
    score: check.score,
    comment: check.invented.length === 0 ? "none" : check.invented.join(", "),
  };
}

async function usefulness(args: { inputs: { [key: string]: unknown }; outputs: { [key: string]: unknown } }): Promise<EvaluationResult> {
  const example = exampleInputs(args.inputs);
  const body = typeof args.outputs.body === "string" ? args.outputs.body : "";
  const response = await ai().chat.completions.create({
    model: MODELS.classify,
    messages: [
      {
        role: "system",
        content:
          'Judge whether this explanation is specific enough to be useful to a developer who has not read the file. This is a judgment, not a fact. Score useful true only if the explanation says what this file does and how it relates to the files it was shown. Score useful false if a reader could not tell this file from a different one. Answer only with the JSON the schema asks for.',
      },
      { role: "user", content: `File: ${example.file.path}\n\nExplanation:\n${body}` },
    ],
    reasoning_effort: "low",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "usefulness",
        strict: true,
        schema: {
          type: "object",
          properties: { useful: { type: "boolean" } },
          required: ["useful"],
          additionalProperties: false,
        },
      },
    },
  });
  const content = response.choices[0]?.message.content;
  if (!content) throw new Error("The usefulness judge returned nothing");
  const parsed: unknown = JSON.parse(content);
  const useful = typeof parsed === "object" && parsed !== null && Reflect.get(parsed, "useful") === true;
  return { key: "useful", score: useful ? 1 : 0, comment: "Model judge. Not an exact measure." };
}

async function datasetExamples(root: string): Promise<ExampleInputs[]> {
  const parsed = await parseRepository(root);
  const files = await filesForEval(root, parsed);
  const picked = files
    .filter((entry) => entry.file.imports.length + entry.file.importedBy.length > 0 && entry.source.length <= SOURCE_CAP)
    .sort((left, right) => left.file.path.localeCompare(right.file.path))
    .slice(0, EXAMPLE_CAP);
  if (picked.length < 4) {
    throw new Error(`Need at least 4 files with a neighbour and under ${SOURCE_CAP} characters. Found ${picked.length}.`);
  }
  return picked.map(exampleOf);
}

function exampleOf(entry: EvalFile): ExampleInputs {
  return { file: entry.file, source: entry.source };
}

function exampleInputs(value: { [key: string]: unknown }): ExampleInputs {
  const source = value.source;
  if (typeof source !== "string" || !isFileInput(value.file)) {
    throw new Error("Dataset example is missing the file and its source.");
  }
  return { file: value.file, source };
}

function isFileInput(value: unknown): value is FileInput {
  if (value === null || typeof value !== "object") return false;
  const filePath = Reflect.get(value, "path");
  const hash = Reflect.get(value, "hash");
  const role = Reflect.get(value, "role");
  const exportsValue = Reflect.get(value, "exports");
  const imports = Reflect.get(value, "imports");
  const importedBy = Reflect.get(value, "importedBy");
  return (
    typeof filePath === "string" &&
    typeof hash === "string" &&
    (role === null || typeof role === "string") &&
    Array.isArray(exportsValue) &&
    Array.isArray(imports) &&
    Array.isArray(importedBy)
  );
}

async function rowsOf(results: AsyncIterable<{ evaluationResults: { results: EvaluationResult[] } }>): Promise<EvaluationResult[][]> {
  const rows: EvaluationResult[][] = [];
  for await (const row of results) rows.push(row.evaluationResults.results);
  return rows;
}

function mean(rows: EvaluationResult[][], key: string): number {
  const scores: number[] = [];
  for (const row of rows) {
    const found = row.find((result) => result.key === key);
    if (typeof found?.score === "number") scores.push(found.score);
    else if (typeof found?.score === "boolean") scores.push(found.score ? 1 : 0);
  }
  if (scores.length === 0) throw new Error(`Experiment produced no ${key} scores.`);
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}
