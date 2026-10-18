import { readFileSync } from "node:fs";

import { foldFiles, type MapEdge, type MapFile } from "../lib/map/fold.mts";

const filePath = process.argv[2];
if (filePath === undefined) {
  console.error("usage: node scripts/count-map.mts <preview-graph.json>");
  process.exitCode = 1;
} else {
  const raw: unknown = JSON.parse(readFileSync(filePath, "utf8"));
  if (typeof raw !== "object" || raw === null) throw new Error("graph is not an object");
  const record = raw as { files?: unknown; edges?: unknown };
  if (!Array.isArray(record.files) || !Array.isArray(record.edges)) {
    throw new Error("graph is missing files or edges");
  }
  const files: MapFile[] = record.files.map((file) => {
    if (typeof file !== "object" || file === null) throw new Error("bad file");
    const row = file as Record<string, unknown>;
    if (
      typeof row.path !== "string" ||
      typeof row.folder !== "string" ||
      typeof row.role !== "string" ||
      typeof row.fanIn !== "number" ||
      typeof row.fanOut !== "number"
    ) {
      throw new Error("bad file");
    }
    return {
      path: row.path,
      folder: row.folder,
      role: row.role,
      fanIn: row.fanIn,
      fanOut: row.fanOut,
    };
  });
  const edges: MapEdge[] = record.edges.map((edge) => {
    if (typeof edge !== "object" || edge === null) throw new Error("bad edge");
    const row = edge as Record<string, unknown>;
    if (typeof row.from !== "string" || typeof row.to !== "string") throw new Error("bad edge");
    return { from: row.from, to: row.to };
  });
  const folded = foldFiles(files, edges);
  const sizes = folded.nodes.map((node) => node.files.length);
  const min = Math.min(...sizes);
  const nodeIds = new Set(folded.nodes.map((node) => node.id));
  const dangling = folded.edges.filter((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target));
  console.log(`files: ${files.length}`);
  console.log(`threshold: ${folded.threshold}`);
  console.log(`nodes: ${folded.nodes.length}`);
  console.log(`files per node: ${(files.length / folded.nodes.length).toFixed(1)}`);
  console.log(`min files in a node: ${min}`);
  console.log(`edges: ${folded.edges.length}`);
  console.log(`dangling edges: ${dangling.length}`);
  console.log("nodes:");
  for (const node of [...folded.nodes].sort((left, right) => right.files.length - left.files.length)) {
    console.log(`  ${node.files.length}\t${node.id}\tin ${node.fanIn}\tout ${node.fanOut}`);
  }
}
