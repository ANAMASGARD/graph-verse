"use client";

import { createContext } from "react";

export type HoverTarget = { kind: "file"; path: string } | { kind: "node"; id: string };

export type ExplorerActionsValue = {
  openFolder: (id: string) => void;
  closeFolder: (id: string) => void;
  selectFile: (path: string) => void;
  hoverFile: (path: string) => void;
  hoverNode: (id: string) => void;
  clearHover: () => void;
};

export const ExplorerActions = createContext<ExplorerActionsValue>({
  openFolder: () => undefined,
  closeFolder: () => undefined,
  selectFile: () => undefined,
  hoverFile: () => undefined,
  hoverNode: () => undefined,
  clearHover: () => undefined,
});
