// Neighbour lists for the detail pane. Counts are distinct files, so the
// number shown next to a list is the number of paths in it. Derived from the
// parser's edges; the checked-in result is not rewritten.

import type { MapEdge, MapFile } from "./fold.mts";

export interface DetailFile extends MapFile {
  lines: number;
  roleSource: string;
}

export interface RankedFile {
  path: string;
  importedBy: number;
}

const UNIDENTIFIED_SOURCE = "fallback";

export function incomingCounts(edges: readonly MapEdge[]): Map<string, number> {
  const sources = new Map<string, Set<string>>();
  for (const edge of edges) {
    let importers = sources.get(edge.to);
    if (!importers) {
      importers = new Set();
      sources.set(edge.to, importers);
    }
    importers.add(edge.from);
  }
  const counts = new Map<string, number>();
  for (const [path, importers] of sources) counts.set(path, importers.size);
  return counts;
}

export function leanedOn(files: readonly DetailFile[], edges: readonly MapEdge[]): RankedFile[] {
  const counts = incomingCounts(edges);
  return files
    .map((file) => ({ path: file.path, importedBy: counts.get(file.path) ?? 0 }))
    .filter((file) => file.importedBy > 0)
    .sort((left, right) => right.importedBy - left.importedBy || left.path.localeCompare(right.path));
}

export function nothingImports(files: readonly DetailFile[], edges: readonly MapEdge[]): string[] {
  const counts = incomingCounts(edges);
  return files
    .filter((file) => (counts.get(file.path) ?? 0) === 0)
    .map((file) => file.path)
    .sort((left, right) => left.localeCompare(right));
}

export function unidentifiedCount(files: readonly DetailFile[]): number {
  return files.filter((file) => file.roleSource === UNIDENTIFIED_SOURCE).length;
}

export function neighbourLists(
  path: string,
  edges: readonly MapEdge[],
): { dependsOn: string[]; dependedOnBy: string[] } {
  const dependsOn = new Set<string>();
  const dependedOnBy = new Set<string>();
  for (const edge of edges) {
    if (edge.from === path) dependsOn.add(edge.to);
    if (edge.to === path) dependedOnBy.add(edge.from);
  }
  return {
    dependsOn: [...dependsOn].sort((left, right) => left.localeCompare(right)),
    dependedOnBy: [...dependedOnBy].sort((left, right) => left.localeCompare(right)),
  };
}

export function roleBreakdown(files: readonly MapFile[]): { role: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const file of files) counts.set(file.role, (counts.get(file.role) ?? 0) + 1);
  return [...counts.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([role, count]) => ({ role, count }));
}
