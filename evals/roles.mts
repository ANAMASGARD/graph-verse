import path from "node:path";

import type { ModelRole } from "../lib/ai/model-roles.ts";
import { classifyFile, type Cache } from "../lib/ai/tasks.ts";
import { parseRepository } from "../parser/parse-repository.mts";
import { loadAppEnv } from "./env.mts";
import { filesForEval } from "./from-parse.mts";
import { heldOutRole } from "./held-out-roles.mts";

loadAppEnv();

const directory = process.argv[2];
if (!directory || directory.startsWith("--")) {
  console.error("Usage: npm run eval:roles -- <directory>");
  process.exit(1);
}

const root = path.resolve(directory);
const parsed = await parseRepository(root);
const files = await filesForEval(root, parsed);
const heldOut = files.flatMap((entry) => {
  if (entry.file.role === null) return [];
  const expected = heldOutRole(entry.file.role);
  if (expected === null) return [];
  return [{ entry, expected }];
});

if (heldOut.length < 30) {
  console.error(
    `Role dataset has ${heldOut.length} files whose conventional role the classifier is allowed to return. Need at least 30. Point this at a larger repository.`,
  );
  process.exit(1);
}

const cache: Cache = {
  async read() {
    return null;
  },
  async write() {},
};

let correct = 0;
const misses: string[] = [];
await pool(heldOut, 4, async (row) => {
  const { entry, expected } = row;
  let got: ModelRole | null = null;
  try {
    const result = await classifyFile(entry.classify, { cache, source: async () => entry.source });
    got = result.role;
  } catch (error) {
    const message = error instanceof Error ? error.message : "the model call failed";
    misses.push(`${entry.file.path}  expected ${expected}, call failed: ${message}`);
    return;
  }
  if (got === expected) correct += 1;
  else misses.push(`${entry.file.path}  expected ${expected}, got ${got ?? "none"}`);
});

const percent = ((100 * correct) / heldOut.length).toFixed(1);
console.log(`Role accuracy ${percent}% over ${heldOut.length} files.`);
for (const miss of misses) console.log(`  ${miss}`);

async function pool<T>(items: readonly T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const current = index;
      index += 1;
      const item = items[current];
      if (item === undefined) return;
      await worker(item);
    }
  });
  await Promise.all(workers);
}
