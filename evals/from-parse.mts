import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ClassifyInput, FileInput, NeighbourFacts, PromptEdgeKind } from "../lib/ai/prompts.ts";
import { sortNeighbourKinds } from "../lib/ai/prompts.ts";
import type { DependencyEdge, EdgeKind, ParseResult, ParsedFile } from "../parser/types.mts";

export type EvalFile = {
  file: FileInput;
  classify: ClassifyInput;
  source: string;
};

export async function filesForEval(root: string, result: ParseResult): Promise<EvalFile[]> {
  const byPath = new Map(result.files.map((file) => [file.path, file]));
  const out: EvalFile[] = [];
  for (const file of result.files) {
    const source = await readFile(path.join(root, file.path), "utf8");
    const neighbours = neighbourMaps(file.path, byPath, result.edges);
    const input: FileInput = {
      path: file.path,
      hash: file.hash,
      role: file.roleSource === "fallback" ? null : file.role,
      exports: file.exports,
      imports: neighbours.imports,
      importedBy: neighbours.importedBy,
    };
    out.push({
      file: input,
      classify: {
        path: file.path,
        hash: file.hash,
        exports: file.exports,
        imports: input.imports.map((neighbour) => ({ path: neighbour.path, role: neighbour.role })),
        importedBy: input.importedBy.map((neighbour) => ({ path: neighbour.path, role: neighbour.role })),
      },
      source,
    });
  }
  return out;
}

function neighbourMaps(
  filePath: string,
  files: ReadonlyMap<string, ParsedFile>,
  edges: readonly DependencyEdge[],
): { imports: NeighbourFacts[]; importedBy: NeighbourFacts[] } {
  const imports = new Map<string, NeighbourFacts>();
  const importedBy = new Map<string, NeighbourFacts>();
  for (const edge of edges) {
    const kind = promptKind(edge.kind);
    if (kind === null) continue;
    if (edge.from === filePath) addNeighbour(imports, edge.to, kind, edge.typeOnly, files);
    if (edge.to === filePath) addNeighbour(importedBy, edge.from, kind, edge.typeOnly, files);
  }
  return { imports: sortNeighbours(imports), importedBy: sortNeighbours(importedBy) };
}

function addNeighbour(
  into: Map<string, NeighbourFacts>,
  otherPath: string,
  kind: PromptEdgeKind,
  typeOnly: boolean,
  files: ReadonlyMap<string, ParsedFile>,
): void {
  const other = files.get(otherPath);
  const role = other && other.roleSource !== "fallback" ? other.role : null;
  const existing = into.get(otherPath);
  if (!existing) {
    into.set(otherPath, { path: otherPath, role, exports: other?.exports ?? [], kinds: [kind], typeOnly });
    return;
  }
  if (!existing.kinds.includes(kind)) existing.kinds.push(kind);
  existing.typeOnly &&= typeOnly;
}

function sortNeighbours(map: Map<string, NeighbourFacts>): NeighbourFacts[] {
  return [...map.values()]
    .map((neighbour) => ({ ...neighbour, kinds: sortNeighbourKinds(neighbour.kinds) }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function promptKind(kind: EdgeKind): PromptEdgeKind | null {
  switch (kind) {
    case "IMPORTS":
      return "import";
    case "RE_EXPORTS":
      return "re_export";
    case "DYNAMIC_IMPORT":
      return "dynamic_import";
    case "REQUIRES":
      return "require";
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}
