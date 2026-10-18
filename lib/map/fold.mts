// Folding is derived from the parser result. The checked-in file stays as the
// parser wrote it. Directories start as their own nodes. A pass walks from the
// deepest directory upward and merges any directory holding fewer files than
// the threshold into its parent. Counts at one depth are taken before any
// merge at that depth. The threshold starts at a couple of files and rises
// until the map is under two dozen nodes. The lowest such threshold wins.

export interface MapFile {
  path: string;
  folder: string;
  role: string;
  fanIn: number;
  fanOut: number;
}

export interface MapEdge {
  from: string;
  to: string;
}

export interface FoldedNode {
  id: string;
  files: MapFile[];
  fanIn: number;
  fanOut: number;
}

export interface FoldedEdge {
  id: string;
  source: string;
  target: string;
  sourceFile: string;
  targetFile: string;
}

export interface FoldResult {
  threshold: number;
  nodes: FoldedNode[];
  /** One edge per pair of folded nodes. Internal edges are not drawn while both ends are closed. */
  edges: FoldedEdge[];
  /** Every parser edge between two parsed files, unchanged. */
  links: MapEdge[];
  fileNode: ReadonlyMap<string, string>;
}

export interface VisualEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
}

export const FOLDER_HANDLE = "folder";

const NODE_CAP = 24;

export function parentDirectory(directory: string): string {
  if (directory === ".") return ".";
  const slash = directory.lastIndexOf("/");
  return slash === -1 ? "." : directory.slice(0, slash);
}

function directoryDepth(directory: string): number {
  if (directory === ".") return 0;
  return directory.split("/").length;
}

function fileDirectory(folder: string): string {
  return folder === "" ? "." : folder;
}

function directoriesOf(files: readonly MapFile[]): Set<string> {
  const directories = new Set<string>();
  for (const file of files) {
    let directory = fileDirectory(file.folder);
    directories.add(directory);
    while (directory !== ".") {
      directory = parentDirectory(directory);
      directories.add(directory);
    }
  }
  return directories;
}

function foldOnce(files: readonly MapFile[], threshold: number): Map<string, string> {
  const assignment = new Map<string, string>();
  for (const file of files) assignment.set(file.path, fileDirectory(file.folder));
  const directories = directoriesOf(files);
  const maxDepth = Math.max(0, ...[...directories].map(directoryDepth));

  for (let depth = maxDepth; depth >= 1; depth -= 1) {
    const atDepth = [...directories].filter((directory) => directoryDepth(directory) === depth).sort();
    const counts = new Map<string, number>();
    for (const directory of atDepth) counts.set(directory, 0);
    for (const target of assignment.values()) {
      if (!counts.has(target)) continue;
      counts.set(target, (counts.get(target) ?? 0) + 1);
    }
    for (const directory of atDepth) {
      if ((counts.get(directory) ?? 0) >= threshold) continue;
      const parent = parentDirectory(directory);
      for (const [path, target] of assignment) {
        if (target === directory) assignment.set(path, parent);
      }
    }
  }
  return assignment;
}

function groupFiles(files: readonly MapFile[], assignment: ReadonlyMap<string, string>): Map<string, MapFile[]> {
  const groups = new Map<string, MapFile[]>();
  for (const file of files) {
    const id = assignment.get(file.path) ?? ".";
    const list = groups.get(id);
    if (list) list.push(file);
    else groups.set(id, [file]);
  }
  for (const list of groups.values()) {
    list.sort((left, right) => left.path.localeCompare(right.path));
  }
  return groups;
}

function boundaryMetrics(
  files: readonly MapFile[],
  edges: readonly MapEdge[],
): { fanIn: number; fanOut: number } {
  const inside = new Set(files.map((file) => file.path));
  const incoming = new Set<string>();
  const outgoing = new Set<string>();
  for (const edge of edges) {
    const fromInside = inside.has(edge.from);
    const toInside = inside.has(edge.to);
    if (toInside && !fromInside) incoming.add(edge.from);
    if (fromInside && !toInside) outgoing.add(edge.to);
  }
  return { fanIn: incoming.size, fanOut: outgoing.size };
}

function crossEdges(
  edges: readonly MapEdge[],
  assignment: ReadonlyMap<string, string>,
  nodeIds: ReadonlySet<string>,
): FoldedEdge[] {
  const seen = new Set<string>();
  const folded: FoldedEdge[] = [];
  const ordered = [...edges].sort((left, right) => {
    return (
      left.from.localeCompare(right.from) ||
      left.to.localeCompare(right.to)
    );
  });
  for (const edge of ordered) {
    const source = assignment.get(edge.from);
    const target = assignment.get(edge.to);
    if (source === undefined || target === undefined) continue;
    if (source === target) continue;
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue;
    const id = `${source}->${target}`;
    if (seen.has(id)) continue;
    seen.add(id);
    folded.push({
      id,
      source,
      target,
      sourceFile: edge.from,
      targetFile: edge.to,
    });
  }
  return folded;
}

export function foldFiles(files: readonly MapFile[], edges: readonly MapEdge[]): FoldResult {
  let threshold = 2;
  let assignment = foldOnce(files, threshold);
  let groups = groupFiles(files, assignment);
  while (groups.size > NODE_CAP && threshold < files.length) {
    threshold += 1;
    assignment = foldOnce(files, threshold);
    groups = groupFiles(files, assignment);
  }

  const nodes: FoldedNode[] = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, members]) => {
      const metrics = boundaryMetrics(members, edges);
      return { id, files: members, fanIn: metrics.fanIn, fanOut: metrics.fanOut };
    });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const links = [...edges]
    .filter((edge) => assignment.has(edge.from) && assignment.has(edge.to))
    .sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to));
  return {
    threshold,
    nodes,
    edges: crossEdges(edges, assignment, nodeIds),
    links,
    fileNode: assignment,
  };
}

export function shownFiles(folded: FoldResult, open: ReadonlySet<string>): Map<string, ReadonlySet<string>> {
  const shown = new Map<string, ReadonlySet<string>>();
  for (const node of folded.nodes) {
    if (!open.has(node.id)) continue;
    shown.set(node.id, new Set(visibleFiles(node).shown.map((file) => file.path)));
  }
  return shown;
}

export function handleForFile(
  file: string,
  nodeId: string,
  open: ReadonlySet<string>,
  shown: ReadonlyMap<string, ReadonlySet<string>>,
): string {
  if (!open.has(nodeId)) return FOLDER_HANDLE;
  if (shown.get(nodeId)?.has(file)) return file;
  return FOLDER_HANDLE;
}

export function visualEdges(folded: FoldResult, open: ReadonlySet<string>): VisualEdge[] {
  const shown = shownFiles(folded, open);
  const seen = new Set<string>();
  const visual: VisualEdge[] = [];
  for (const link of folded.links) {
    const source = folded.fileNode.get(link.from);
    const target = folded.fileNode.get(link.to);
    if (source === undefined || target === undefined) continue;
    const sourceHandle = handleForFile(link.from, source, open, shown);
    const targetHandle = handleForFile(link.to, target, open, shown);
    if (source === target && sourceHandle === FOLDER_HANDLE && targetHandle === FOLDER_HANDLE) continue;
    const id = `${source}|${sourceHandle}->${target}|${targetHandle}`;
    if (seen.has(id)) continue;
    seen.add(id);
    visual.push({ id, source, target, sourceHandle, targetHandle });
  }
  return visual;
}

export type MapSelection =
  | { kind: "node"; id: string }
  | { kind: "file"; path: string }
  | null;

export function labelsOnScreen(folded: FoldResult, open: ReadonlySet<string>): Map<string, string> {
  const paths: string[] = [];
  for (const node of folded.nodes) {
    paths.push(node.id);
    if (!open.has(node.id)) continue;
    for (const file of visibleFiles(node).shown) paths.push(file.path);
  }
  return shortestLabels(paths);
}

export function shortestLabels(paths: readonly string[]): Map<string, string> {
  const labels = new Map<string, string>();
  const parts = new Map(paths.map((path) => [path, path === "." ? ["."] : path.split("/")]));
  for (const path of paths) {
    const own = parts.get(path) ?? [path];
    let label = path;
    for (let length = 1; length <= own.length; length += 1) {
      const candidate = own.slice(-length).join("/");
      const collisions = paths.filter((other) => {
        const otherParts = parts.get(other) ?? [other];
        return otherParts.slice(-length).join("/") === candidate;
      });
      if (collisions.length === 1) {
        label = candidate;
        break;
      }
    }
    labels.set(path, label);
  }
  return labels;
}

export const VISIBLE_ROWS = 8;

export function visibleFiles(node: FoldedNode): { shown: MapFile[]; hidden: number } {
  const ranked = [...node.files].sort((left, right) => {
    return right.fanIn - left.fanIn || left.path.localeCompare(right.path);
  });
  const shown = ranked.slice(0, VISIBLE_ROWS);
  return { shown, hidden: node.files.length - shown.length };
}
