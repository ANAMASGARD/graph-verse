// Depth-limited neighbourhood of one file. Two hops is the whole answer:
// FalkorDB writes the same bound as *1..2, which starts at the first
// neighbour and stops at the second. The page already holds the edges, so
// the walk stays in the browser. The start file is not a result.

import type { MapEdge } from "./fold.mts";

export const WALK_DEPTH = 2;

export type WalkDirection = "out" | "in";

export interface WalkHit {
  path: string;
  depth: number;
}

export function walkFiles(
  start: string,
  edges: readonly MapEdge[],
  direction: WalkDirection,
  maxDepth = WALK_DEPTH,
): WalkHit[] {
  const next = new Map<string, string[]>();
  for (const edge of edges) {
    const from = source(edge, direction);
    const to = target(edge, direction);
    const list = next.get(from);
    if (list) {
      if (!list.includes(to)) list.push(to);
    } else next.set(from, [to]);
  }

  const depthOf = new Map<string, number>();
  const queue: WalkHit[] = [{ path: start, depth: 0 }];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    if (current === undefined || current.depth === maxDepth) continue;
    for (const path of next.get(current.path) ?? []) {
      if (path === start || depthOf.has(path)) continue;
      const depth = current.depth + 1;
      depthOf.set(path, depth);
      queue.push({ path, depth });
    }
  }

  return [...depthOf.entries()]
    .map(([path, depth]) => ({ path, depth }))
    .sort((left, right) => left.depth - right.depth || left.path.localeCompare(right.path));
}

function source(edge: MapEdge, direction: WalkDirection): string {
  switch (direction) {
    case "out":
      return edge.from;
    case "in":
      return edge.to;
    default: {
      const unreachable: never = direction;
      return unreachable;
    }
  }
}

function target(edge: MapEdge, direction: WalkDirection): string {
  switch (direction) {
    case "out":
      return edge.to;
    case "in":
      return edge.from;
    default: {
      const unreachable: never = direction;
      return unreachable;
    }
  }
}
