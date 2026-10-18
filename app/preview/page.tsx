import path from "node:path";

import { Explorer } from "@/components/explorer/explorer";
import { readParseResult } from "@/parser/read-result.mts";

export default function PreviewPage() {
  const result = readParseResult(path.join(process.cwd(), "data/preview-graph.json"));
  return (
    <Explorer
      repository={result.repository}
      files={result.files.map((file) => ({
        path: file.path,
        folder: file.folder,
        role: file.role,
        fanIn: file.fanIn,
        fanOut: file.fanOut,
      }))}
      edges={result.edges.map((edge) => ({ from: edge.from, to: edge.to }))}
    />
  );
}
