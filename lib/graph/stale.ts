import type { AnalysisListItem, AnalysisStatus } from "@/lib/graph/analysis-types";

/** Unfinished runs older than this are shown as stale. Five minutes is "a few". */
export const STALE_AFTER_MS = 5 * 60 * 1000;

export function isUnfinished(status: AnalysisStatus): boolean {
  return status === "queued" || status === "running";
}

export function isUnfinishedStale(
  row: Pick<AnalysisListItem, "status" | "startedAt" | "createdAt">,
  now = Date.now(),
): boolean {
  if (!isUnfinished(row.status)) return false;
  const started = Date.parse(row.startedAt ?? row.createdAt);
  return Number.isFinite(started) && now - started >= STALE_AFTER_MS;
}
