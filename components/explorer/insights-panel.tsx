"use client";

import { useMemo, useState, type ReactNode } from "react";

import type { FoldResult, MapEdge } from "@/lib/map/fold.mts";
import type { DetailFile } from "@/lib/map/detail.mts";
import {
  INSIGHT_CYCLE,
  INSIGHT_LONG,
  INSIGHT_UNIMPORTED,
  INSIGHT_UNUSUAL,
  insights,
} from "@/lib/map/insights.mts";
import type { HoverTarget } from "./actions.mts";

type InsightsPanelProps = {
  files: readonly DetailFile[];
  edges: readonly MapEdge[];
  folded: FoldResult;
  hover: HoverTarget | null;
  onSelectFile: (path: string) => void;
  onHoverFile: (path: string) => void;
  onClearHover: () => void;
};

export function InsightsPanel({
  files,
  edges,
  folded,
  hover,
  onSelectFile,
  onHoverFile,
  onClearHover,
}: InsightsPanelProps) {
  const [open, setOpen] = useState(false);
  const report = useMemo(() => insights(files, edges), [files, edges]);

  return (
    <section className="insights">
      <button
        type="button"
        className="insights-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Insights
      </button>
      {open ? (
        <div className="insights-body">
          <InsightGroup title={INSIGHT_UNIMPORTED} kind="unimported">
            {report.unimported.map((path) => (
              <li key={path}>
                <PathRow
                  path={path}
                  hovered={pathLit(path, hover, folded)}
                  onSelectFile={onSelectFile}
                  onHoverFile={onHoverFile}
                  onClearHover={onClearHover}
                />
              </li>
            ))}
          </InsightGroup>
          <InsightGroup title={INSIGHT_UNUSUAL} kind="unusual">
            {report.unusual.map((file) => (
              <li key={file.path}>
                <PathRow
                  path={file.path}
                  count={file.importedBy}
                  hovered={pathLit(file.path, hover, folded)}
                  onSelectFile={onSelectFile}
                  onHoverFile={onHoverFile}
                  onClearHover={onClearHover}
                />
              </li>
            ))}
          </InsightGroup>
          <InsightGroup title={INSIGHT_CYCLE} kind="cycle">
            {report.cycles.map((cycle) => (
              <li key={cycle.join("\0")} className="insight-cycle" data-cycle={cycle.join(">")}>
                {cycle.map((path, index) => (
                  <span key={`${path}-${index}`}>
                    {index > 0 ? <span className="insight-arrow"> → </span> : null}
                    <PathRow
                      path={path}
                      inline
                      hovered={pathLit(path, hover, folded)}
                      onSelectFile={onSelectFile}
                      onHoverFile={onHoverFile}
                      onClearHover={onClearHover}
                    />
                  </span>
                ))}
                <span className="insight-arrow"> → {cycle[0]}</span>
              </li>
            ))}
          </InsightGroup>
          <InsightGroup title={INSIGHT_LONG} kind="long">
            {report.long.map((file) => (
              <li key={file.path}>
                <PathRow
                  path={file.path}
                  count={file.lines}
                  hovered={pathLit(file.path, hover, folded)}
                  onSelectFile={onSelectFile}
                  onHoverFile={onHoverFile}
                  onClearHover={onClearHover}
                />
              </li>
            ))}
          </InsightGroup>
        </div>
      ) : null}
    </section>
  );
}

function InsightGroup({
  title,
  kind,
  children,
}: {
  title: string;
  kind: string;
  children: ReactNode;
}) {
  return (
    <section data-insight={kind}>
      <h3 className="detail-heading">{title}</h3>
      <ul className="detail-paths">{children}</ul>
    </section>
  );
}

function PathRow({
  path,
  count,
  inline = false,
  hovered,
  onSelectFile,
  onHoverFile,
  onClearHover,
}: {
  path: string;
  count?: number;
  inline?: boolean;
  hovered: boolean;
  onSelectFile: (path: string) => void;
  onHoverFile: (path: string) => void;
  onClearHover: () => void;
}) {
  return (
    <button
      type="button"
      className={`detail-path${inline ? " detail-path-inline" : ""}${hovered ? " detail-path-hover" : ""}`}
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

function pathLit(path: string, hover: HoverTarget | null, folded: FoldResult): boolean {
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
