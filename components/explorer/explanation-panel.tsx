"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import type { ExplainResult } from "@/app/(app)/dashboard/analyses/[id]/actions";
import { reanalyseAction } from "@/app/(app)/dashboard/analyses/[id]/actions";
import { modelRoleLabel, type ModelRole } from "@/lib/ai/model-roles";
import { ExplanationText } from "./explanation-text";

export type ExplainTarget = { kind: "file"; path: string } | { kind: "folder"; dir: string };

export function targetKey(target: ExplainTarget): string {
  return target.kind === "file" ? `file:${target.path}` : `folder:${target.dir}`;
}

export type ExplanationState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "done"; result: Extract<ExplainResult, { ok: true }> };

export type Freshness =
  | { status: "checking" }
  | { status: "current" }
  | { status: "moved"; head: string; file: "unchanged" | "changed" | "deleted" | null }
  | { status: "unknown"; error: string };

export function ExplanationPanel(props: {
  target: ExplainTarget;
  analysisId: string;
  commitSha: string;
  state: ExplanationState | undefined;
  freshness: Freshness | undefined;
  onExplain: (target: ExplainTarget) => void;
  isPath: (path: string) => boolean;
  renderPath: (path: string) => ReactNode;
}) {
  const { target, state } = props;
  const what = target.kind === "file" ? "this file" : "this folder";

  if (!state) {
    return (
      <div className="explanation-panel">
        <ExplainButton label="Explain" onClick={() => props.onExplain(target)} />
        <p className="explanation-hint">
          {target.kind === "file"
            ? "Written from this file's source and every file it imports or is imported by, as parsed."
            : "Written from what's in this folder and every import crossing into or out of it, as parsed."}
        </p>
      </div>
    );
  }
  if (state.status === "loading") {
    return <p className="explanation-panel explanation-muted">Explaining {what}…</p>;
  }
  if (state.status === "error") {
    return (
      <div className="explanation-panel">
        <p>Couldn&apos;t explain {what}.</p>
        <p className="explanation-muted explanation-error">{state.error}</p>
        <ExplainButton label="Try again" onClick={() => props.onExplain(target)} />
      </div>
    );
  }

  const { result } = state;
  return (
    <div className="explanation-panel">
      <FreshnessNote
        freshness={props.freshness}
        target={target}
        analysisId={props.analysisId}
        commitSha={props.commitSha}
      />
      <ExplanationText text={result.body} isPath={props.isPath} onPath={props.renderPath} />
      <div className="explanation-meta">
        {result.labelled ? (
          <p>
            {result.labelled.role === null
              ? "No convention identified this file, and the model found no role that fits."
              : `No convention identified this file; the model labelled it ${modelRoleLabel(result.labelled.role as ModelRole)}.`}
          </p>
        ) : null}
        {result.labelError ? <p>Labelling this file failed: {result.labelError}</p> : null}
        <p>
          <span className="explanation-model">{result.model}</span>
          {" · "}
          {result.cached ? "from cache, no model call" : "new answer"}
        </p>
        <p>
          {result.tracing.on
            ? `Traced to LangSmith project ${result.tracing.project}`
            : `Not traced: ${result.tracing.reason}`}
        </p>
      </div>
    </div>
  );
}

function FreshnessNote(props: {
  freshness: Freshness | undefined;
  target: ExplainTarget;
  analysisId: string;
  commitSha: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const freshness = props.freshness;
  if (!freshness || freshness.status === "current") return null;
  const analysed = <span className="explanation-model">{props.commitSha.slice(0, 7)}</span>;
  if (freshness.status === "checking") {
    return <p className="explanation-stale">Checking the repository for newer commits…</p>;
  }
  if (freshness.status === "unknown") {
    return <p className="explanation-stale">Couldn&apos;t check whether this is still current: {freshness.error}</p>;
  }
  const head = <span className="explanation-model">{freshness.head.slice(0, 7)}</span>;
  let sentence: ReactNode;
  if (freshness.file === "changed") {
    sentence = (
      <>
        This file has changed since {analysed} was analysed, so this explanation is stale. The repository is at {head}.
      </>
    );
  } else if (freshness.file === "deleted") {
    sentence = (
      <>
        This file no longer exists at {head}, the repository&apos;s latest commit. {analysed} was analysed.
      </>
    );
  } else if (freshness.file === "unchanged") {
    sentence = (
      <>
        The repository has moved past {analysed} to {head}. This file is unchanged, but its neighbours may not be.
      </>
    );
  } else {
    sentence = (
      <>
        The repository has moved past {analysed} to {head}, so this explanation may be stale.
      </>
    );
  }
  return (
    <div className="explanation-stale-box">
      <p>{sentence}</p>
      <button
        type="button"
        className="explanation-action"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await reanalyseAction(props.analysisId);
            if (result.error) {
              setError(result.error);
              return;
            }
            router.refresh();
          })
        }
      >
        {pending ? "Starting…" : "Re-analyse"}
      </button>
      {error ? <p className="explanation-muted explanation-error">{error}</p> : null}
    </div>
  );
}

function ExplainButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="explanation-action" onClick={onClick}>
      {label}
    </button>
  );
}
