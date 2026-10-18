"use client";

import { useMemo, useState } from "react";

import { foldFiles, type MapFile, type MapEdge, type MapSelection } from "@/lib/map/fold.mts";
import { ExplorerActions } from "./actions.mts";
import { MapCanvas } from "./map-canvas";

const ROLE_COLOURS = ["#2f6fbb", "#c47a12", "#1f8a5b", "#8d6bb5", "#b85c5c"];

type ExplorerProps = {
  repository: string;
  files: MapFile[];
  edges: MapEdge[];
};

export function Explorer({ repository, files, edges }: ExplorerProps) {
  const folded = useMemo(() => foldFiles(files, edges), [files, edges]);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [selection, setSelection] = useState<MapSelection>(null);
  const categories = useMemo(() => roleCounts(files), [files]);

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
            {categories.map((category) => (
              <li key={category.role}>
                <span className="explorer-swatch" style={{ background: category.color }} />
                <span className="explorer-role">{category.role}</span>
                <span className="explorer-count">{category.count}</span>
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
            onClear={() => setSelection(null)}
          />
        </div>
        <aside className="explorer-detail" aria-label="Detail" />
      </div>
    </ExplorerActions.Provider>
  );
}

function roleCounts(files: readonly MapFile[]): { role: string; count: number; color: string }[] {
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
