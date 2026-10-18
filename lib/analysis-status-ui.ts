import type { AnalysisStatus } from "@/lib/graph/analysis-types";

export type StatusUi = {
  symbol: string;
  label: string;
  rowClass: string;
  chipClass: string;
};

export function statusUi(status: AnalysisStatus): StatusUi {
  switch (status) {
    case "queued":
      return {
        symbol: "○",
        label: "queued",
        rowClass: "text-muted-foreground",
        chipClass: "text-muted-foreground",
      };
    case "running":
      return {
        symbol: "◐",
        label: "parsing",
        rowClass: "text-primary",
        chipClass: "text-primary",
      };
    case "complete":
      return {
        symbol: "●",
        label: "complete",
        rowClass: "text-foreground",
        chipClass: "text-foreground",
      };
    case "failed":
      return {
        symbol: "⊗",
        label: "failed",
        rowClass: "text-destructive",
        chipClass: "text-destructive",
      };
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
