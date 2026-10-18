import fs from "node:fs";

import { formatParseSummary } from "./format-summary.mts";
import { parseRepository } from "./parse-repository.mts";
import { readParseResult } from "./read-result.mts";

function usage(): string {
  return [
    "usage:",
    "  node parser/cli.mts <directory> [--out <file>]",
    "  node parser/cli.mts --read <file>",
  ].join("\n");
}

function argument(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} needs a value\n${usage()}`);
  }
  return value;
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    if (argv.length === 0) process.exitCode = 1;
    return;
  }

  if (argv[0] === "--read") {
    const file = argument(argv, 1, "--read");
    if (argv.length !== 2) throw new Error(usage());
    const result = readParseResult(file);
    console.log(formatParseSummary(result));
    console.log("read back: types hold");
    return;
  }

  let directory: string | null = null;
  let out: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--out") {
      index += 1;
      out = argument(argv, index, "--out");
      continue;
    }
    if (token === undefined) continue;
    if (token.startsWith("--")) throw new Error(`unknown argument ${token}\n${usage()}`);
    if (directory !== null) throw new Error(usage());
    directory = token;
  }
  if (directory === null) throw new Error(usage());

  const result = parseRepository(directory);
  if (out !== null) {
    fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(formatParseSummary(result));
  if (out !== null) console.log(`wrote ${out}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
