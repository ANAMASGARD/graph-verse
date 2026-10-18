export const ANALYSIS_STATUSES = [
  "queued",
  "running",
  "complete",
  "failed",
] as const;

export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export const ANALYSIS_STAGES = ["fetch", "select", "parse", "store"] as const;

export type AnalysisStage = (typeof ANALYSIS_STAGES)[number];

export type AnalysisListItem = {
  id: string;
  status: AnalysisStatus;
  stage: AnalysisStage | null;
  stageMessage: string | null;
  commitSha: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  repoOwner: string;
  repoName: string;
};

export function isAnalysisStatus(value: unknown): value is AnalysisStatus {
  return (
    typeof value === "string" &&
    (ANALYSIS_STATUSES as readonly string[]).includes(value)
  );
}

export function isAnalysisStage(value: unknown): value is AnalysisStage {
  return (
    typeof value === "string" &&
    (ANALYSIS_STAGES as readonly string[]).includes(value)
  );
}
