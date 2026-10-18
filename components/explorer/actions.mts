"use client";

import { createContext } from "react";

export type ExplorerActionsValue = {
  openFolder: (id: string) => void;
  closeFolder: (id: string) => void;
  selectFile: (path: string) => void;
};

export const ExplorerActions = createContext<ExplorerActionsValue>({
  openFolder: () => undefined,
  closeFolder: () => undefined,
  selectFile: () => undefined,
});
