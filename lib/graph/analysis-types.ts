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

/** The only payload a progress stream publishes. */
export type ProgressEvent = {
  status: AnalysisStatus;
  stage: AnalysisStage | null;
  message: string;
};

export function parseProgressEvent(value: unknown): ProgressEvent | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!isAnalysisStatus(record.status)) return null;
  if (record.stage !== null && !isAnalysisStage(record.stage)) return null;
  if (typeof record.message !== "string") return null;
  return {
    status: record.status,
    stage: record.stage,
    message: record.message,
  };
}
