import { statusUi } from "@/lib/analysis-status-ui";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type { AnalysisListItem, AnalysisStatus } from "@/lib/graph/analysis-types";

type AnalysisDashboardProps = {
  orgName: string;
  analyses: AnalysisListItem[];
};

function countByStatus(
  analyses: AnalysisListItem[],
  status: AnalysisStatus,
): number {
  return analyses.filter((a) => a.status === status).length;
}

function startedAt(row: AnalysisListItem): string | null {
  return row.startedAt ?? row.createdAt;
}

export function AnalysisDashboard({ orgName, analyses }: AnalysisDashboardProps) {
  const total = analyses.length;
  const queued = countByStatus(analyses, "queued");
  const running = countByStatus(analyses, "running");
  const complete = countByStatus(analyses, "complete");
  const failed = countByStatus(analyses, "failed");

  if (total === 0) {
    return (
      <div className="brutal-surface w-full px-5 py-8 sm:px-8">
        <p className="workspace-display text-2xl font-bold tracking-tight">
          {orgName}
        </p>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          0 analyses
        </p>
        <p className="mt-6 max-w-lg text-base font-medium leading-relaxed text-muted-foreground">
          No repository runs for this team yet. When the parser pipeline lands,
          completed runs will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="workspace-display text-2xl font-bold tracking-tight sm:text-3xl">
            {orgName}
          </h1>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            {total} {total === 1 ? "analysis" : "analyses"}
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-muted-foreground">
          <li>
            <span className="text-primary">◐</span> {running} parsing
          </li>
          <li>
            <span>○</span> {queued} queued
          </li>
          <li>
            <span className="text-foreground">●</span> {complete} complete
          </li>
          <li>
            <span className="text-destructive">⊗</span> {failed} failed
          </li>
        </ul>
      </div>

      <section className="brutal-surface w-full min-w-0 overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-left text-base">
            <colgroup>
              <col className="w-[38%]" />
              <col className="w-[14%]" />
              <col className="w-[12%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead>
              <tr className="border-b-2 border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-6 py-4 text-left font-bold">Repository</th>
                <th className="px-6 py-4 text-left font-bold">State</th>
                <th className="px-6 py-4 text-left font-bold">Commit</th>
                <th className="px-6 py-4 text-left font-bold">Started</th>
                <th className="px-6 py-4 text-left font-bold">Finished</th>
              </tr>
            </thead>
            <tbody>
              {analyses.map((row) => {
                const ui = statusUi(row.status);
                const showSubline =
                  (row.status === "failed" || row.status === "running") &&
                  row.stageMessage;

                return (
                  <tr
                    key={row.id}
                    className="border-b border-border/50 last:border-b-0"
                  >
                    <td className="px-6 py-4 align-top">
                      <span className="workspace-mono text-base font-semibold text-foreground">
                        {row.repoOwner}/{row.repoName}
                      </span>
                      {showSubline ? (
                        <p
                          className={`workspace-mono mt-1.5 text-sm font-medium leading-snug ${
                            row.status === "failed"
                              ? "text-destructive"
                              : "text-muted-foreground"
                          }`}
                        >
                          {row.stageMessage}
                        </p>
                      ) : null}
                    </td>
                    <td className={`px-6 py-4 align-top ${ui.chipClass}`}>
                      <span className="workspace-mono text-base font-bold">
                        {ui.symbol} {ui.label}
                      </span>
                    </td>
                    <td className="workspace-mono px-6 py-4 align-top text-base font-semibold text-muted-foreground">
                      {row.commitSha ? row.commitSha.slice(0, 7) : "—"}
                    </td>
                    <td className="workspace-mono px-6 py-4 align-top text-base font-semibold text-muted-foreground">
                      {formatRelativeTime(startedAt(row))}
                    </td>
                    <td className="workspace-mono px-6 py-4 align-top text-base font-semibold text-muted-foreground">
                      {formatRelativeTime(row.finishedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
