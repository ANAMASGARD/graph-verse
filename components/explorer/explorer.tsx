"use client";

import { useMemo, useState } from "react";

import type { DetailFile } from "@/lib/map/detail.mts";
import { foldFiles, type MapEdge, type MapSelection } from "@/lib/map/fold.mts";
import { ExplorerActions, type HoverTarget } from "./actions.mts";
import { DetailPane } from "./detail-pane";
import { MapCanvas } from "./map-canvas";

const ROLE_COLOURS = ["#2f6fbb", "#c47a12", "#1f8a5b", "#8d6bb5", "#b85c5c"];

type ExplorerProps = {
  repository: string;
  framework: string | null;
  importCount: number;
  routeCount: number;
  files: DetailFile[];
  edges: MapEdge[];
};

export function Explorer({ repository, framework, importCount, routeCount, files, edges }: ExplorerProps) {
  const folded = useMemo(() => foldFiles(files, edges), [files, edges]);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [selection, setSelection] = useState<MapSelection>(null);
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const categories = useMemo(() => roleCounts(files), [files]);
  const roleColor = useMemo(() => new Map(categories.map((category) => [category.role, category.color])), [categories]);

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
          <MapCanvas
            folded={folded}
            open={open}
            selection={selection}
            roleColor={categories[0]?.color ?? ROLE_COLOURS[0]}
            hover={hover}
            category={category}
            onClear={() => setSelection(null)}
          />
        </div>
        <DetailPane
          repository={repository}
          framework={framework}
          importCount={importCount}
          routeCount={routeCount}
          files={files}
          edges={edges}
          folded={folded}
          selection={selection}
          hover={hover}
          roleColor={roleColor}
          onSelectFile={actions.selectFile}
          onHoverFile={actions.hoverFile}
          onClearHover={actions.clearHover}
        />
      </div>
    </ExplorerActions.Provider>
  );
}

function roleCounts(files: readonly DetailFile[]): { role: string; count: number; color: string }[] {
  const counts = new Map<string, number>();
  for (const file of files) counts.set(file.role, (counts.get(file.role) ?? 0) + 1);
  return [...counts.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([role, count], index) => ({
      role,
      count,
      color: ROLE_COLOURS[index % ROLE_COLOURS.length] ?? ROLE_COLOURS[0],
    }));
}
