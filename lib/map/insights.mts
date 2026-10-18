// Four facts about the edge list. Each one has one fixed sentence. A file
// nothing imports is not an orphan when a convention already reached it:
// pages, routes, layouts, middleware and config are entered by the framework.

import type { MapEdge } from "./fold.mts";
import type { DetailFile } from "./detail.mts";
import { reachedByFrameworkRole } from "./taxonomy.mts";

export const INSIGHT_UNIMPORTED = "Nothing imports these files.";
export const INSIGHT_UNUSUAL = "An unusual number of files import these.";
export const INSIGHT_CYCLE = "These files import each other in a cycle.";
export const INSIGHT_LONG = "These files are longer than a thousand lines.";

export const LONG_FILE_LINES = 1000;

const FRAMEWORK_REACHED = new Set([
  "page",
  "pages",
  "route",
  "routes",
  "layout",
  "layouts",
  "middleware",
  "config",
]);

export interface InsightReport {
  unimported: string[];
  unusual: { path: string; importedBy: number }[];
  cycles: string[][];
  long: { path: string; lines: number }[];
}

export function reachedByFramework(role: string): boolean {
  if (reachedByFrameworkRole(role)) return true;
  const tokens = role.toLowerCase().split(/[^a-z]+/);
  return tokens.some((token) => FRAMEWORK_REACHED.has(token));
}

export function insights(files: readonly DetailFile[], edges: readonly MapEdge[]): InsightReport {
  const importedBy = incomingCounts(edges);
  const counts = files.map((file) => importedBy.get(file.path) ?? 0);
  const cutoff = mean(counts) + 2 * standardDeviation(counts);

  return {
    unimported: files
      .filter((file) => (importedBy.get(file.path) ?? 0) === 0 && !reachedByFramework(file.role))
      .map((file) => file.path)
      .sort((left, right) => left.localeCompare(right)),
    unusual: files
      .map((file) => ({ path: file.path, importedBy: importedBy.get(file.path) ?? 0 }))
      .filter((file) => file.importedBy > cutoff)
      .sort((left, right) => right.importedBy - left.importedBy || left.path.localeCompare(right.path)),
    cycles: findCycles(edges),
    long: files
      .filter((file) => file.lines > LONG_FILE_LINES)
      .map((file) => ({ path: file.path, lines: file.lines }))
      .sort((left, right) => right.lines - left.lines || left.path.localeCompare(right.path)),
  };
}

function incomingCounts(edges: readonly MapEdge[]): Map<string, number> {
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

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const center = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - center) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// Iterative depth-first search. A recursive walk blows the stack on a real
// repository. A back edge into the active path is a cycle; rotation keeps
// the same cycle from being recorded twice.
function findCycles(edges: readonly MapEdge[]): string[][] {
  const adjacent = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacent.get(edge.from);
    if (list) {
      if (!list.includes(edge.to)) list.push(edge.to);
    } else adjacent.set(edge.from, [edge.to]);
  }
  for (const list of adjacent.values()) list.sort((left, right) => left.localeCompare(right));

  const color = new Map<string, 0 | 1 | 2>();
  const found = new Map<string, string[]>();
  const starts = [...adjacent.keys()].sort((left, right) => left.localeCompare(right));

  for (const start of starts) {
    if ((color.get(start) ?? 0) !== 0) continue;
    const stack: string[] = [start];
    const position = new Map<string, number>([[start, 0]]);
    const frames: { node: string; neighbours: readonly string[]; index: number }[] = [
      { node: start, neighbours: adjacent.get(start) ?? [], index: 0 },
    ];
    color.set(start, 1);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      if (frame === undefined) break;
      if (frame.index >= frame.neighbours.length) {
        color.set(frame.node, 2);
        stack.pop();
        position.delete(frame.node);
        frames.pop();
        continue;
      }
      const next = frame.neighbours[frame.index];
      frame.index += 1;
      if (next === undefined) continue;
      const state = color.get(next) ?? 0;
      if (state === 1) {
        const at = position.get(next);
        if (at === undefined) continue;
        const cycle = rotate(stack.slice(at));
        const key = cycle.join("\0");
        if (!found.has(key)) found.set(key, cycle);
        continue;
      }
      if (state === 0) {
        color.set(next, 1);
        position.set(next, stack.length);
        stack.push(next);
        frames.push({ node: next, neighbours: adjacent.get(next) ?? [], index: 0 });
      }
    }
  }

  return [...found.values()].sort((left, right) => {
    return left.length - right.length || left.join("\0").localeCompare(right.join("\0"));
  });
}

function rotate(cycle: readonly string[]): string[] {
  let best = 0;
  for (let index = 1; index < cycle.length; index += 1) {
    const path = cycle[index];
    const current = cycle[best];
    if (path !== undefined && current !== undefined && path < current) best = index;
  }
  return cycle.slice(best).concat(cycle.slice(0, best));
}
