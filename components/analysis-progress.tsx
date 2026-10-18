"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  ANALYSIS_STAGES,
  parseProgressEvent,
  type AnalysisStage,
  type ProgressEvent,
} from "@/lib/graph/analysis-types";
import { isUnfinishedStale } from "@/lib/graph/stale";

type AnalysisProgressProps = {
  analysisId: string;
  owner: string;
  name: string;
  createdAt: string;
  startedAt: string | null;
  initial: ProgressEvent;
};

export function AnalysisProgress({
  analysisId,
  owner,
  name,
  createdAt,
  startedAt,
  initial,
}: AnalysisProgressProps) {
  const router = useRouter();
  const [event, setEvent] = useState(initial);
  const stale = isUnfinishedStale({ status: event.status, createdAt, startedAt });

  useEffect(() => {
    const source = new EventSource(`/dashboard/analyses/${analysisId}/events`);
    source.onmessage = (message) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(message.data);
      } catch {
        return;
      }
      const next = parseProgressEvent(parsed);
      if (!next) return;
      setEvent(next);
      if (next.status === "complete" || next.status === "failed") {
        source.close();
        router.refresh();
      }
    };
    return () => source.close();
  }, [analysisId, router]);

  const current = event.stage === null ? -1 : ANALYSIS_STAGES.indexOf(event.stage);

  return (
    <section className="brutal-surface w-full max-w-xl px-6 py-6">
      <p className="workspace-mono text-sm font-semibold text-muted-foreground">
        {owner}/{name}
      </p>
      <h1 className="workspace-display mt-1 text-2xl font-bold tracking-tight">Analysis</h1>
      <ol className="mt-6 flex flex-col gap-3">
        {ANALYSIS_STAGES.map((stage, index) => (
          <li key={stage} className="flex items-baseline gap-3">
            <span className="workspace-mono w-4 text-base font-bold">{mark(stage, index, current, event.status)}</span>
            <span className="text-base font-semibold capitalize">{stage}</span>
            {stage === event.stage ? (
              <span className="workspace-mono text-sm font-medium text-muted-foreground">{event.message}</span>
            ) : null}
          </li>
        ))}
      </ol>
      {event.status === "failed" ? (
        <p className="mt-5 text-sm font-semibold text-destructive">{event.message}</p>
      ) : null}
      {stale ? (
        <p className="mt-5 text-sm font-semibold text-muted-foreground">
          This run has been unfinished for more than five minutes.
        </p>
      ) : null}
    </section>
  );
}

function mark(stage: AnalysisStage, index: number, current: number, status: ProgressEvent["status"]): string {
  if (status === "failed" && stage === ANALYSIS_STAGES[current]) return "⊗";
  if (status === "complete") return "●";
  if (current === -1) return "○";
  if (index < current) return "●";
  if (index === current) return "◐";
  return "○";
}
