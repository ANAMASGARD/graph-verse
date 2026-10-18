"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { use } from "react";

import { HEADER_HEIGHT, MORE_HEIGHT, ROW_HEIGHT } from "@/lib/map/layout.mts";
import { FOLDER_HANDLE } from "@/lib/map/fold.mts";
import { ExplorerActions } from "./actions.mts";

export type FolderRow = {
  path: string;
  label: string;
  selected: boolean;
  hovered: boolean;
  dimmed: boolean;
};

export type FolderNodeData = {
  label: string;
  fileCount: number;
  fanIn: number;
  fanOut: number;
  matched: number | null;
  open: boolean;
  rows: FolderRow[];
  hidden: number;
  selected: boolean;
  hovered: boolean;
  dimmed: boolean;
  roleColor: string;
};

export type FolderNodeProps = NodeProps & { data: FolderNodeData };

export function FolderNode({ id, data }: FolderNodeProps) {
  const actions = use(ExplorerActions);
  const hiddenHandle = { opacity: 0, width: 8, height: 8, border: "none", background: "transparent" };

  return (
    <div
      className={`map-node${data.open ? " map-node-open" : ""}${data.selected ? " map-node-selected" : ""}${data.hovered ? " map-node-hover" : ""}${data.dimmed ? " map-node-dim" : ""}`}
      style={{ borderLeftColor: data.roleColor }}
      data-folder={id}
      data-open={data.open ? "true" : "false"}
      data-match={data.matched === null ? undefined : data.matched}
      data-hovered={data.hovered ? "true" : "false"}
      onMouseOver={(event) => {
        const row = event.target instanceof Element ? event.target.closest("[data-file]") : null;
        if (row instanceof HTMLElement && row.dataset.file) {
          actions.hoverFile(row.dataset.file);
          return;
        }
        actions.hoverNode(id);
      }}
      onMouseLeave={() => actions.clearHover()}
    >
      <Handle type="target" position={Position.Left} id={FOLDER_HANDLE} style={hiddenHandle} />
      <Handle type="source" position={Position.Right} id={FOLDER_HANDLE} style={hiddenHandle} />
      {data.open
        ? data.rows.map((row, index) => {
            const top = HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2;
            return (
              <span key={row.path}>
                <Handle
                  type="target"
                  position={Position.Left}
                  id={row.path}
                  style={{ ...hiddenHandle, top }}
                />
                <Handle
                  type="source"
                  position={Position.Right}
                  id={row.path}
                  style={{ ...hiddenHandle, top }}
                />
              </span>
            );
          })
        : null}
      <button
        type="button"
        className="map-node-header"
        style={{ height: data.open ? HEADER_HEIGHT : "100%" }}
        onClick={(event) => {
          event.stopPropagation();
          if (data.open) actions.closeFolder(id);
          else actions.openFolder(id);
        }}
      >
        <span className="map-node-title">
          <span className="map-node-label">{data.label}</span>
          {data.matched !== null ? <span className="map-node-match">{data.matched}</span> : null}
        </span>
        {data.open ? (
          <span className="map-node-meta">
            {data.fileCount} files · in {data.fanIn} · out {data.fanOut}
          </span>
        ) : null}
      </button>
      {data.open ? (
        <div className="map-node-rows">
          {data.rows.map((row) => (
            <button
              key={row.path}
              type="button"
              className={`map-node-row${row.selected ? " map-node-row-selected" : ""}${row.hovered ? " map-node-row-hover" : ""}${row.dimmed ? " map-node-row-dim" : ""}`}
              style={{ height: ROW_HEIGHT }}
              data-file={row.path}
              data-hovered={row.hovered ? "true" : "false"}
              onClick={(event) => {
                event.stopPropagation();
                actions.selectFile(row.path);
              }}
            >
              {row.label}
            </button>
          ))}
          {data.hidden > 0 ? (
            <div className="map-node-more" style={{ height: MORE_HEIGHT }}>
              {data.hidden} more
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
