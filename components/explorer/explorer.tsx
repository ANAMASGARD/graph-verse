"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import {
  explainFileAction,
  explainFolderAction,
  fileAtHeadAction,
  repositoryHeadAction,
  type HeadResult,
} from "@/app/(app)/dashboard/analyses/[id]/actions";
import type { DetailFile } from "@/lib/map/detail.mts";
import { foldFiles, type MapEdge, type MapSelection } from "@/lib/map/fold.mts";
import type { MapCoverage } from "@/lib/map/coverage.mts";
import { railRoles, type MapRoute } from "@/lib/map/taxonomy.mts";
import { ExplorerActions, type HoverTarget } from "./actions.mts";
import { CoverageBanner } from "./coverage-banner";
import { DetailPane } from "./detail-pane";
import { targetKey, type ExplainTarget, type ExplanationState, type Freshness } from "./explanation-panel";
import { MapCanvas } from "./map-canvas";

const ROLE_COLOURS = ["#2f6fbb", "#c47a12", "#1f8a5b", "#8d6bb5", "#b85c5c"];

type ExplorerProps = {
  analysisId: string;
  commitSha: string;
  repository: string;
  framework: string | null;
  importCount: number;
  routes: MapRoute[];
  files: DetailFile[];
  edges: MapEdge[];
  coverage: MapCoverage | null;
  initialModelRoles: Record<string, string>;
};

export function Explorer({
  analysisId,
  commitSha,
  repository,
  framework,
  importCount,
  routes,
  files,
  edges,
  coverage,
  initialModelRoles,
}: ExplorerProps) {
  const folded = useMemo(() => foldFiles(files, edges), [files, edges]);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [selection, setSelection] = useState<MapSelection>(null);
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<ReadonlyMap<string, ExplanationState>>(() => new Map());
  const [freshness, setFreshness] = useState<ReadonlyMap<string, Freshness>>(() => new Map());
  const [modelRoles, setModelRoles] = useState<ReadonlyMap<string, string>>(
    () => new Map(Object.entries(initialModelRoles)),
  );
  const head = useRef<Promise<HeadResult> | null>(null);

  const categories = useMemo(() => roleCounts(framework, files, modelRoles), [framework, files, modelRoles]);
  const roleColor = useMemo(() => new Map(categories.map((entry) => [entry.role, entry.color])), [categories]);

  const explain = useCallback(
    (target: ExplainTarget) => {
      const key = targetKey(target);
      setExplanations((current) => new Map(current).set(key, { status: "loading" }));
      setFreshness((current) => new Map(current).set(key, { status: "checking" }));

      void (async () => {
        const result = await (target.kind === "file"
          ? explainFileAction(analysisId, target.path)
          : explainFolderAction(analysisId, target.dir));
        setExplanations((current) =>
          new Map(current).set(key, result.ok ? { status: "done", result } : { status: "error", error: result.error }),
        );
        if (result.ok && target.kind === "file" && result.labelled !== null && result.labelled.role !== null) {
          const role = result.labelled.role;
          setModelRoles((current) => new Map(current).set(target.path, role));
        }
      })();

      void (async () => {
        const latest = await (head.current ??= repositoryHeadAction(analysisId));
        if (!latest.ok) head.current = null;
        let state: Freshness;
        if (!latest.ok) state = { status: "unknown", error: latest.error };
        else if (latest.head === latest.analysed) state = { status: "current" };
        else if (target.kind === "folder") state = { status: "moved", head: latest.head, file: null };
        else {
          const file = await fileAtHeadAction(analysisId, target.path, latest.head);
          state = file.ok ? { status: "moved", head: latest.head, file: file.state } : { status: "unknown", error: file.error };
        }
        setFreshness((current) => new Map(current).set(key, state));
      })();
    },
    [analysisId],
  );

  const actions = useMemo(
    () => ({
      openFolder(id: string) {
        setOpen((current) => {
          const next = new Set(current);
          next.add(id);
          return next;
        });
        setSelection({ kind: "node", id });
      },
      closeFolder(id: string) {
        setOpen((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        setSelection({ kind: "node", id });
      },
      selectFile(path: string) {
        setSelection({ kind: "file", path });
      },
      hoverFile(path: string) {
        setHover((current) => (current?.kind === "file" && current.path === path ? current : { kind: "file", path }));
      },
      hoverNode(id: string) {
        setHover((current) => (current?.kind === "node" && current.id === id ? current : { kind: "node", id }));
      },
      clearHover() {
        setHover((current) => (current === null ? current : null));
      },
    }),
    [],
  );

  return (
    <ExplorerActions.Provider value={actions}>
      <div className="explorer">
        <aside className="explorer-rail" aria-label="File categories">
          <p className="explorer-repo">{repository}</p>
          <p className="explorer-rail-label">Categories</p>
          <ul>
            {categories.map((entry) => (
              <li key={entry.role}>
                <button
                  type="button"
                  className={`explorer-category${category === entry.role ? " explorer-category-active" : ""}`}
                  aria-pressed={category === entry.role}
                  onClick={() => setCategory((current) => (current === entry.role ? null : entry.role))}
                >
                  <span className="explorer-swatch" style={{ background: entry.color }} />
                  <span className="explorer-role">{entry.role}</span>
                  <span className="explorer-count">{entry.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <div className="explorer-map">
          {coverage ? <CoverageBanner coverage={coverage} /> : null}
          <div className="explorer-canvas">
            <MapCanvas
              folded={folded}
              open={open}
              selection={selection}
              roleColor={categories[0]?.color ?? ROLE_COLOURS[0]}
              hover={hover}
              category={category}
              modelRoles={modelRoles}
              onClear={() => setSelection(null)}
            />
          </div>
        </div>
        <DetailPane
          repository={repository}
          framework={framework}
          importCount={importCount}
          routes={routes}
          files={files}
          edges={edges}
          folded={folded}
          selection={selection}
          hover={hover}
          roleColor={roleColor}
          analysisId={analysisId}
          commitSha={commitSha}
          modelRoles={modelRoles}
          explanations={explanations}
          freshness={freshness}
          onExplain={explain}
          onSelectFile={actions.selectFile}
          onHoverFile={actions.hoverFile}
          onClearHover={actions.clearHover}
        />
      </div>
    </ExplorerActions.Provider>
  );
}

function roleCounts(
  framework: string | null,
  files: readonly DetailFile[],
  modelRoles: ReadonlyMap<string, string>,
): { role: string; count: number; color: string }[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    const role = modelRoles.get(file.path) ?? file.role;
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  return railRoles(framework, counts).map((entry, index) => ({
    role: entry.role,
    count: entry.count,
    color: ROLE_COLOURS[index % ROLE_COLOURS.length] ?? ROLE_COLOURS[0],
  }));
}
