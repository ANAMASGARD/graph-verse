import { MODEL_ROLES } from "./model-roles";

export const PROMPT_VERSION = 1;

export type PromptEdgeKind = "import" | "re_export" | "dynamic_import" | "require";

export type NeighbourFacts = {
  path: string;
  role: string | null;
  exports: string[];
  kinds: PromptEdgeKind[];
  typeOnly: boolean;
};

export type FileInput = {
  path: string;
  hash: string;
  role: string | null;
  exports: string[];
  imports: NeighbourFacts[];
  importedBy: NeighbourFacts[];
};

export type FolderFile = {
  path: string;
  hash: string;
  role: string | null;
  exports: string[];
  fanIn: number;
  fanOut: number;
};

export type FolderInput = {
  dir: string;
  files: FolderFile[];
  incoming: { from: string; to: string }[];
  outgoing: { from: string; to: string }[];
};

export type ClassifyInput = {
  path: string;
  hash: string;
  exports: string[];
  imports: { path: string; role: string | null }[];
  importedBy: { path: string; role: string | null }[];
};

const PROMPT_EDGE_ORDER: readonly PromptEdgeKind[] = ["import", "re_export", "dynamic_import", "require"];

const FORMAT = `Formatting: plain paragraphs. You may use only three kinds of formatting: inline code in backticks, bullet lists with lines starting "- ", and bold with **double asterisks**. No headings, numbered lists, tables, links, italics or code blocks.`;

const HONESTY = `The lists of imports and importers were resolved by a parser and are complete: they are the only connections that exist. Never mention a file that isn't named in the input, and never suggest a connection the input doesn't list. Write every repository path in full, exactly as given, inside backticks. Describe what the code does; don't grade it, rate it, or suggest improvements.`;

export const EXPLAIN_FILE_SYSTEM = `You explain one file of a TypeScript or JavaScript repository to a developer reading the repository for the first time.

You're given the file's source, and every file it imports and every file that imports it, each with its role and the names it exports. Say what this file does and what part it plays between the files that depend on it and the files it depends on. Two or three short paragraphs; a short bullet list only if it genuinely helps. Refer to neighbours by path where it helps the reader, not as an exhaustive inventory.

${HONESTY}

${FORMAT}`;

export const EXPLAIN_FOLDER_SYSTEM = `You explain one folder of a TypeScript or JavaScript repository to a developer reading the repository for the first time.

The question is about the folder as a whole, not any single file in it: what kind of code lives here and what the files have in common, and why files outside point at it, meaning which of its files are imported from outside and what imports them. If little or nothing outside imports it, say so and say what it depends on instead. Two or three short paragraphs; a short bullet list only if it genuinely helps.

${HONESTY}

${FORMAT}`;

export const CLASSIFY_SYSTEM = `You label one file of a TypeScript or JavaScript repository that no framework convention identified. Choose the single role that best describes it from: ${MODEL_ROLES.join(", ")}. Answer "none" if none of them clearly fits. Use its path, the names it exports, its source, and the roles of the files around it. Answer only with the JSON the schema asks for.`;

export function explainFileMessage(input: FileInput, source: string): string {
  return [
    `File: ${input.path}`,
    `Role: ${input.role ?? "not identified"}`,
    `Exports: ${input.exports.length ? input.exports.join(", ") : "nothing named"}`,
    "",
    `It imports ${input.imports.length} ${input.imports.length === 1 ? "file" : "files"}:`,
    ...neighbourLines(input.imports),
    "",
    `It is imported by ${input.importedBy.length} ${input.importedBy.length === 1 ? "file" : "files"}:`,
    ...neighbourLines(input.importedBy),
    "",
    `Source of ${input.path}:`,
    "<<<",
    source,
    ">>>",
  ].join("\n");
}

export function explainFolderMessage(input: FolderInput): string {
  const importers = new Map<string, number>();
  for (const edge of input.incoming) importers.set(edge.to, (importers.get(edge.to) ?? 0) + 1);
  const outside = new Set(input.incoming.map((edge) => edge.from));
  return [
    `Folder: ${input.dir === "." ? "(repository root)" : `${input.dir}/`}`,
    `${input.files.length} ${input.files.length === 1 ? "file" : "files"}, ${outside.size} outside ${outside.size === 1 ? "file imports" : "files import"} into it.`,
    "",
    "Files in it (role; exports; imported by N files anywhere; imports N files):",
    ...input.files.map(
      (file) =>
        `- ${file.path} (${file.role ?? "no role"}; ${file.exports.length ? file.exports.join(", ") : "no named exports"}; imported by ${file.fanIn}; imports ${file.fanOut}${importers.has(file.path) ? `; ${importers.get(file.path)} of its importers are outside the folder` : ""})`,
    ),
    "",
    `Imports into it from outside (${input.incoming.length}):`,
    ...(input.incoming.length ? input.incoming.map((edge) => `- ${edge.from} → ${edge.to}`) : ["- none"]),
    "",
    `Imports from it to outside (${input.outgoing.length}):`,
    ...(input.outgoing.length ? input.outgoing.map((edge) => `- ${edge.from} → ${edge.to}`) : ["- none"]),
  ].join("\n");
}

export function classifyMessage(input: ClassifyInput, excerpt: string): string {
  const line = (neighbour: { path: string; role: string | null }) =>
    `- ${neighbour.path}${neighbour.role ? ` (${neighbour.role})` : ""}`;
  return [
    `File: ${input.path}`,
    `Exports: ${input.exports.length ? input.exports.join(", ") : "nothing named"}`,
    "Imports:",
    ...(input.imports.length ? input.imports.map(line) : ["- none"]),
    "Imported by:",
    ...(input.importedBy.length ? input.importedBy.map(line) : ["- none"]),
    "",
    "Start of its source:",
    "<<<",
    excerpt,
    ">>>",
  ].join("\n");
}

function neighbourLines(list: NeighbourFacts[]): string[] {
  if (list.length === 0) return ["- none"];
  return list.map((neighbour) => {
    const marks = [
      neighbour.role ?? "no role",
      neighbour.exports.length ? `exports ${neighbour.exports.join(", ")}` : "no named exports",
      ...neighbour.kinds.filter((kind) => kind !== "import"),
      ...(neighbour.typeOnly ? ["types only"] : []),
    ];
    return `- ${neighbour.path} (${marks.join("; ")})`;
  });
}

export function sortNeighbourKinds(kinds: PromptEdgeKind[]): PromptEdgeKind[] {
  return PROMPT_EDGE_ORDER.filter((kind) => kinds.includes(kind));
}
