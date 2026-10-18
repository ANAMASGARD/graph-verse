import dagre from "dagre";

import {
  visibleFiles,
  visualEdges,
  type FoldedNode,
  type FoldResult,
} from "./fold.mts";

export const HEADER_HEIGHT = 38;
export const ROW_HEIGHT = 20;
export const MORE_HEIGHT = 18;

const COLLAPSED_MIN_HEIGHT = 36;
const COLLAPSED_MAX_HEIGHT = 148;

export interface PlacedNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  node: FoldedNode;
}

function textWidth(text: string): number {
  return Math.ceil(text.length * 6.7) + 28;
}

export function nodeSize(
  node: FoldedNode,
  open: boolean,
  folderLabel: string,
  rowLabels: readonly string[],
  maxFanIn: number,
  matched: number | null = null,
): { width: number; height: number } {
  const label = matched === null ? folderLabel : `${folderLabel} ${matched}`;
  const texts = open
    ? [label, `${node.files.length} files · in ${node.fanIn} · out ${node.fanOut}`, ...rowLabels]
    : [label];
  const width = Math.max(96, ...texts.map(textWidth));
  if (!open) {
    const scale = maxFanIn === 0 ? 0 : node.fanIn / maxFanIn;
    return {
      width,
      height: Math.round(COLLAPSED_MIN_HEIGHT + scale * (COLLAPSED_MAX_HEIGHT - COLLAPSED_MIN_HEIGHT)),
    };
  }
  const { shown, hidden } = visibleFiles(node);
  return {
    width,
    height: HEADER_HEIGHT + shown.length * ROW_HEIGHT + (hidden > 0 ? MORE_HEIGHT : 0),
  };
}

/**
 * Same nodes and the same open set always produce the same coordinates.
 * Dagre sees nodes and edges in sorted order, and self-loops are omitted
 * from the layout pass so they cannot shove a node around.
 */
export function layoutFolders(
  folded: FoldResult,
  open: ReadonlySet<string>,
  labels: ReadonlyMap<string, string>,
  matched: ReadonlyMap<string, number> | null = null,
): PlacedNode[] {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", nodesep: 16, ranksep: 40, marginx: 16, marginy: 16 });

  const maxFanIn = folded.nodes.reduce((max, node) => Math.max(max, node.fanIn), 0);
  const sizes = new Map<string, { width: number; height: number }>();
  const ordered = [...folded.nodes].sort((left, right) => left.id.localeCompare(right.id));
  for (const node of ordered) {
    const rowLabels = open.has(node.id)
      ? visibleFiles(node).shown.map((file) => labels.get(file.path) ?? file.path)
      : [];
    const size = nodeSize(
      node,
      open.has(node.id),
      labels.get(node.id) ?? node.id,
      rowLabels,
      maxFanIn,
      matched?.get(node.id) ?? null,
    );
    sizes.set(node.id, size);
    graph.setNode(node.id, size);
  }

  const seen = new Set<string>();
  const edges = visualEdges(folded, open).sort((left, right) => left.id.localeCompare(right.id));
  for (const edge of edges) {
    if (edge.source === edge.target) continue;
    const key = `${edge.source}->${edge.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  return ordered.map((node) => {
    const laid = graph.node(node.id);
    const size = sizes.get(node.id) ?? { width: 120, height: COLLAPSED_MIN_HEIGHT };
    return {
      id: node.id,
      x: laid.x - size.width / 2,
      y: laid.y - size.height / 2,
      width: size.width,
      height: size.height,
      label: labels.get(node.id) ?? node.id,
      node,
    };
  });
}
