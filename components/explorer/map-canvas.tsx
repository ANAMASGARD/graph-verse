"use client";

import {
  Background,
  BackgroundVariant,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import { useLayoutEffect, useMemo, useRef } from "react";
import "@xyflow/react/dist/style.css";

import {
  handleForFile,
  labelsOnScreen,
  shownFiles,
  visibleFiles,
  visualEdges,
  type FoldedNode,
  type FoldResult,
  type MapFile,
  type MapSelection,
} from "@/lib/map/fold.mts";
import { layoutFolders } from "@/lib/map/layout.mts";
import type { HoverTarget } from "./actions.mts";
import { FolderNode, type FolderNodeData } from "./folder-node";

const nodeTypes: NodeTypes = { folder: FolderNode };

type MapCanvasProps = {
  folded: FoldResult;
  open: ReadonlySet<string>;
  selection: MapSelection;
  hover: HoverTarget | null;
  category: string | null;
  roleColor: string;
  modelRoles: ReadonlyMap<string, string>;
  onClear: () => void;
};

function MapSurface({ folded, open, selection, hover, category, roleColor, modelRoles, onClear }: MapCanvasProps) {
  const { fitView, getZoom } = useReactFlow();
  const previousOpen = useRef<ReadonlySet<string>>(new Set());
  const openKey = [...open].sort().join("\n");

  const labels = useMemo(() => labelsOnScreen(folded, open), [folded, open]);
  const matched = useMemo(() => matchCounts(folded, category, modelRoles), [category, folded, modelRoles]);
  const placed = useMemo(() => layoutFolders(folded, open, labels, matched), [folded, labels, matched, open]);
  const drawn = useMemo(() => visualEdges(folded, open), [folded, open]);
  const shown = useMemo(() => shownFiles(folded, open), [folded, open]);

  const nodes = useMemo<Node<FolderNodeData, "folder">[]>(() => {
    return placed.map((place) => {
      const visible = visibleFiles(place.node).shown;
      const nodeHover = folderHovered(hover, place.id, place.node, open.has(place.id), visible);
      const rowHover = (path: string) => hover?.kind === "file" && hover.path === path;
      const nodeMatched = matched?.get(place.id) ?? null;
      const categoryDim = nodeMatched === 0;
      return {
        id: place.id,
        type: "folder",
        position: { x: place.x, y: place.y },
        width: place.width,
        height: place.height,
        initialWidth: place.width,
        initialHeight: place.height,
        draggable: false,
        selectable: false,
        style: { width: place.width, height: place.height },
        data: {
          label: place.label,
          fileCount: place.node.files.length,
          fanIn: place.node.fanIn,
          fanOut: place.node.fanOut,
          open: open.has(place.id),
          hidden: place.node.files.length - visible.length,
          matched: nodeMatched,
          selected: selection?.kind === "node" && selection.id === place.id,
          hovered: nodeHover,
          dimmed:
            (categoryDim || nodeDimmed(selection, place.id, folded)) &&
            !nodeHover &&
            !visible.some((file) => rowHover(file.path)),
          roleColor,
          rows: visible.map((file) => {
            const role = modelRoles.get(file.path) ?? file.role;
            return {
              path: file.path,
              label: labels.get(file.path) ?? file.path,
              selected: selection?.kind === "file" && selection.path === file.path,
              hovered: rowHover(file.path),
              dimmed:
                (rowDimmed(selection, file.path, folded) || (nodeMatched !== null && nodeMatched > 0 && role !== category)) &&
                !rowHover(file.path),
            };
          }),
        },
      };
    });
  }, [category, folded, hover, labels, matched, modelRoles, open, placed, roleColor, selection]);

  const edges = useMemo<Edge[]>(() => {
    return drawn.map((edge) => {
      const kind = edgeKind(edge, selection, folded, open, shown);
      const stroke = kind === "in" ? "var(--map-in)" : kind === "dim" ? "var(--border)" : "var(--map-out)";
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        selectable: false,
        style: { stroke, strokeWidth: 1.25, opacity: kind === "dim" ? 0.28 : 1 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: stroke },
      };
    });
  }, [drawn, folded, open, selection, shown]);

  useLayoutEffect(() => {
    const added = [...open].filter((id) => !previousOpen.current.has(id));
    previousOpen.current = open;
    if (added.length === 0) return;
    const zoom = getZoom();
    const frame = requestAnimationFrame(() => {
      void fitView({
        nodes: added.map((id) => ({ id })),
        padding: 0.2,
        duration: 0,
        maxZoom: zoom,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [fitView, getZoom, open, openKey]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      defaultViewport={{ x: 16, y: 16, zoom: 1 }}
      minZoom={0.25}
      maxZoom={1.5}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      zoomOnDoubleClick={false}
      proOptions={{ hideAttribution: false }}
      onPaneClick={onClear}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--border)" />
    </ReactFlow>
  );
}

export function MapCanvas(props: MapCanvasProps) {
  return (
    <ReactFlowProvider>
      <MapSurface {...props} />
    </ReactFlowProvider>
  );
}

function matchCounts(
  folded: FoldResult,
  category: string | null,
  modelRoles: ReadonlyMap<string, string>,
): ReadonlyMap<string, number> | null {
  if (category === null) return null;
  const counts = new Map<string, number>();
  for (const node of folded.nodes) {
    counts.set(
      node.id,
      node.files.filter((file) => (modelRoles.get(file.path) ?? file.role) === category).length,
    );
  }
  return counts;
}

function folderHovered(
  hover: HoverTarget | null,
  id: string,
  node: FoldedNode,
  isOpen: boolean,
  visible: readonly MapFile[],
): boolean {
  if (hover === null) return false;
  switch (hover.kind) {
    case "node":
      return hover.id === id;
    case "file": {
      const contains = node.files.some((file) => file.path === hover.path);
      if (!contains) return false;
      if (!isOpen) return true;
      return !visible.some((file) => file.path === hover.path);
    }
    default: {
      const unreachable: never = hover;
      return unreachable;
    }
  }
}

function nodeDimmed(selection: MapSelection, id: string, folded: FoldResult): boolean {
  if (selection === null) return false;
  return !focusNodes(selection, folded).has(id);
}

function rowDimmed(selection: MapSelection, path: string, folded: FoldResult): boolean {
  if (selection === null || selection.kind === "node") return false;
  if (path === selection.path) return false;
  for (const link of folded.links) {
    if (link.from === selection.path && link.to === path) return false;
    if (link.to === selection.path && link.from === path) return false;
  }
  return true;
}

function focusNodes(selection: Exclude<MapSelection, null>, folded: FoldResult): Set<string> {
  const focus = new Set<string>();
  if (selection.kind === "node") focus.add(selection.id);
  else {
    const home = folded.fileNode.get(selection.path);
    if (home !== undefined) focus.add(home);
  }
  for (const link of folded.links) {
    const fromNode = folded.fileNode.get(link.from);
    const toNode = folded.fileNode.get(link.to);
    if (fromNode === undefined || toNode === undefined) continue;
    const touches =
      selection.kind === "file"
        ? link.from === selection.path || link.to === selection.path
        : fromNode === selection.id || toNode === selection.id;
    if (!touches) continue;
    focus.add(fromNode);
    focus.add(toNode);
  }
  return focus;
}

function edgeKind(
  edge: { source: string; target: string; sourceHandle: string; targetHandle: string },
  selection: MapSelection,
  folded: FoldResult,
  open: ReadonlySet<string>,
  shown: ReadonlyMap<string, ReadonlySet<string>>,
): "in" | "out" | "dim" {
  if (selection === null) return "out";
  let incoming = false;
  let outgoing = false;
  for (const link of folded.links) {
    const source = folded.fileNode.get(link.from);
    const target = folded.fileNode.get(link.to);
    if (source === undefined || target === undefined) continue;
    if (source !== edge.source || target !== edge.target) continue;
    if (handleForFile(link.from, source, open, shown) !== edge.sourceHandle) continue;
    if (handleForFile(link.to, target, open, shown) !== edge.targetHandle) continue;
    if (selection.kind === "file") {
      if (link.to === selection.path) incoming = true;
      if (link.from === selection.path) outgoing = true;
    } else if (target === selection.id && source !== selection.id) {
      incoming = true;
    } else if (source === selection.id && target !== selection.id) {
      outgoing = true;
    } else if (source === selection.id && target === selection.id) {
      outgoing = true;
    }
  }
  if (!incoming && !outgoing) return "dim";
  if (incoming && !outgoing) return "in";
  return "out";
}
