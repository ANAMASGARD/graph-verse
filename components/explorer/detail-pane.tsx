"use client";

import { useMemo, useState } from "react";

import type { FoldResult, MapEdge, MapSelection } from "@/lib/map/fold.mts";
import {
  leanedOn,
  neighbourLists,
  nothingImports,
  roleBreakdown,
  unidentifiedCount,
  type DetailFile,
} from "@/lib/map/detail.mts";
import { walkFiles, type WalkDirection } from "@/lib/map/walk.mts";
import type { HoverTarget } from "./actions.mts";
import { InsightsPanel } from "./insights-panel";

type DetailTab = "structure" | "explanation";

type DetailPaneProps = {
  repository: string;
  framework: string | null;
  importCount: number;
  routeCount: number;
  files: readonly DetailFile[];
  edges: readonly MapEdge[];
  folded: FoldResult;
  selection: MapSelection;
  hover: HoverTarget | null;
  roleColor: ReadonlyMap<string, string>;
  onSelectFile: (path: string) => void;
  onHoverFile: (path: string) => void;
  onClearHover: () => void;
};

export function DetailPane({
  repository,
  framework,
  importCount,
  routeCount,
  files,
  edges,
  folded,
  selection,
  hover,
  roleColor,
  onSelectFile,
  onHoverFile,
  onClearHover,
}: DetailPaneProps) {
  const [tab, setTab] = useState<DetailTab>("structure");
  const byPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files]);

  return (
    <aside className="explorer-detail" aria-label="Detail">
      <div className="detail-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "structure"} onClick={() => setTab("structure")}>
          Structure
        </button>
        <button type="button" role="tab" aria-selected={tab === "explanation"} onClick={() => setTab("explanation")}>
          Explanation
        </button>
      </div>
      <div className="detail-body" role="tabpanel">
        {tab === "explanation" ? (
          <p className="detail-empty">No explanation yet.</p>
        ) : (
          <Structure
            repository={repository}
            framework={framework}
            importCount={importCount}
            routeCount={routeCount}
            files={files}
            edges={edges}
            folded={folded}
            selection={selection}
            hover={hover}
            byPath={byPath}
            roleColor={roleColor}
            onSelectFile={onSelectFile}
            onHoverFile={onHoverFile}
            onClearHover={onClearHover}
          />
        )}
      </div>
      <InsightsPanel
        files={files}
        edges={edges}
        folded={folded}
        hover={hover}
        onSelectFile={onSelectFile}
        onHoverFile={onHoverFile}
        onClearHover={onClearHover}
      />
    </aside>
  );
}

type StructureProps = DetailPaneProps & { byPath: ReadonlyMap<string, DetailFile> };

function Structure(props: StructureProps) {
  const { selection } = props;
  if (selection === null) return <RepositorySummary {...props} />;
  switch (selection.kind) {
    case "file":
      return <FileStructure {...props} path={selection.path} />;
    case "node":
      return <FolderStructure {...props} id={selection.id} />;
    default: {
      const unreachable: never = selection;
      return unreachable;
    }
  }
}

function RepositorySummary({
  repository,
  framework,
  importCount,
  routeCount,
  files,
  edges,
  folded,
  hover,
  onSelectFile,
  onHoverFile,
  onClearHover,
}: StructureProps) {
  const leaned = useMemo(() => leanedOn(files, edges), [files, edges]);
  const unread = useMemo(() => nothingImports(files, edges), [files, edges]);
  const unidentified = unidentifiedCount(files);

  return (
    <div data-detail="summary">
      <h2 className="detail-name">{repository}</h2>
      <dl className="detail-facts">
        <div>
          <dt>Framework</dt>
          <dd>{framework ?? "none"}</dd>
        </div>
        <div>
          <dt>Files</dt>
          <dd>{files.length}</dd>
        </div>
        <div>
          <dt>Imports</dt>
          <dd>{importCount}</dd>
        </div>
        <div>
          <dt>Routes</dt>
          <dd>{routeCount}</dd>
        </div>
        <div>
          <dt>No convention</dt>
          <dd>{unidentified}</dd>
        </div>
      </dl>
      <h3 className="detail-heading">
        Leaned on <span className="detail-count">{leaned.length}</span>
      </h3>
      <ul className="detail-paths">
        {leaned.map((file) => (
          <li key={file.path}>
            <PathButton
              path={file.path}
              count={file.importedBy}
              hovered={pathHovered(file.path, hover, folded)}
              onSelectFile={onSelectFile}
              onHoverFile={onHoverFile}
              onClearHover={onClearHover}
            />
          </li>
        ))}
      </ul>
      <h3 className="detail-heading">
        Nothing imports <span className="detail-count">{unread.length}</span>
      </h3>
      <ul className="detail-paths">
        {unread.map((path) => (
          <li key={path}>
            <PathButton
              path={path}
              hovered={pathHovered(path, hover, folded)}
              onSelectFile={onSelectFile}
              onHoverFile={onHoverFile}
              onClearHover={onClearHover}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FileStructure({
  path,
  edges,
  folded,
  hover,
  byPath,
  roleColor,
  onSelectFile,
  onHoverFile,
  onClearHover,
}: StructureProps & { path: string }) {
  const file = byPath.get(path);
  const lists = useMemo(() => neighbourLists(path, edges), [path, edges]);
  const [walkKind, setWalkKind] = useState<WalkKind | null>(null);
  const direction = walkDirection(walkKind);
  const hits = useMemo(
    () => (direction === null ? [] : walkFiles(path, edges, direction)),
    [direction, path, edges],
  );

  return (
    <div data-detail="file" data-path={path}>
      <PathButton
        path={path}
        heading
        hovered={pathHovered(path, hover, folded)}
        onSelectFile={onSelectFile}
        onHoverFile={onHoverFile}
        onClearHover={onClearHover}
      />
      <dl className="detail-facts">
        <div>
          <dt>Kind</dt>
          <dd>
            {file ? (
              <>
                <span className="explorer-swatch" style={{ background: roleColor.get(file.role) ?? "transparent" }} />
                {file.role}
              </>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Lines</dt>
          <dd>{file ? file.lines : null}</dd>
        </div>
      </dl>
      <div className="detail-walks">
        <button
          type="button"
          aria-pressed={walkKind === "blast"}
          onClick={() => setWalkKind((current) => (current === "blast" ? null : "blast"))}
        >
          Blast radius
        </button>
        <button
          type="button"
          aria-pressed={walkKind === "chain"}
          onClick={() => setWalkKind((current) => (current === "chain" ? null : "chain"))}
        >
          Dependency chain
        </button>
      </div>
      {walkKind !== null ? (
        <ul className="detail-paths" data-walk={walkKind}>
          {hits.map((hit) => (
            <li key={hit.path}>
              <PathButton
                path={hit.path}
                count={hit.depth}
                hovered={pathHovered(hit.path, hover, folded)}
                onSelectFile={onSelectFile}
                onHoverFile={onHoverFile}
                onClearHover={onClearHover}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <h3 className="detail-heading">
        Depends on <span className="detail-count" data-depends={lists.dependsOn.length}>{lists.dependsOn.length}</span>
      </h3>
      <ul className="detail-paths" data-list="depends">
        {lists.dependsOn.map((neighbour) => (
          <li key={neighbour}>
            <PathButton
              path={neighbour}
              hovered={pathHovered(neighbour, hover, folded)}
              onSelectFile={onSelectFile}
              onHoverFile={onHoverFile}
              onClearHover={onClearHover}
            />
          </li>
        ))}
      </ul>
      <h3 className="detail-heading">
        Depend on it <span className="detail-count" data-depended={lists.dependedOnBy.length}>{lists.dependedOnBy.length}</span>
      </h3>
      <ul className="detail-paths" data-list="depended">
        {lists.dependedOnBy.map((neighbour) => (
          <li key={neighbour}>
            <PathButton
              path={neighbour}
              hovered={pathHovered(neighbour, hover, folded)}
              onSelectFile={onSelectFile}
              onHoverFile={onHoverFile}
              onClearHover={onClearHover}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FolderStructure({ id, folded, roleColor }: StructureProps & { id: string }) {
  const node = folded.nodes.find((entry) => entry.id === id);
  const roles = roleBreakdown(node?.files ?? []);

  return (
    <div data-detail="folder" data-folder={id}>
      <h2 className="detail-name">{id}</h2>
      <p className="detail-meta">{node?.files.length ?? 0} files</p>
      <ul className="detail-roles">
        {roles.map((role) => (
          <li key={role.role}>
            <span className="explorer-swatch" style={{ background: roleColor.get(role.role) ?? "transparent" }} />
            <span className="explorer-role">{role.role}</span>
            <span className="detail-count">{role.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PathButton({
  path,
  count,
  heading = false,
  hovered,
  onSelectFile,
  onHoverFile,
  onClearHover,
}: {
  path: string;
  count?: number;
  heading?: boolean;
  hovered: boolean;
  onSelectFile: (path: string) => void;
  onHoverFile: (path: string) => void;
  onClearHover: () => void;
}) {
  return (
    <button
      type="button"
      className={`detail-path${heading ? " detail-path-heading" : ""}${hovered ? " detail-path-hover" : ""}`}
      data-path={path}
      data-hovered={hovered ? "true" : "false"}
      onClick={() => onSelectFile(path)}
      onMouseEnter={() => onHoverFile(path)}
      onMouseLeave={onClearHover}
    >
      <span className="detail-path-name">{path}</span>
      {count !== undefined ? <span className="detail-count">{count}</span> : null}
    </button>
  );
}

type WalkKind = "blast" | "chain";

function walkDirection(kind: WalkKind | null): WalkDirection | null {
  switch (kind) {
    case null:
      return null;
    case "blast":
      return "in";
    case "chain":
      return "out";
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

function pathHovered(path: string, hover: HoverTarget | null, folded: FoldResult): boolean {
  if (hover === null) return false;
  switch (hover.kind) {
    case "file":
      return hover.path === path;
    case "node":
      return folded.fileNode.get(path) === hover.id;
    default: {
      const unreachable: never = hover;
      return unreachable;
    }
  }
}
