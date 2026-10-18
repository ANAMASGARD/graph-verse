"use server";

import { createHash } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { after } from "next/server";

import { tracingStatus, type TracingStatus } from "@/lib/ai/client";
import { classifyFile, explainFile, explainFolder } from "@/lib/ai/tasks";
import type { ModelRole } from "@/lib/ai/model-roles";
import { fetchFileAt, resolveHeadCommit, type Repository } from "@/lib/github/content";
import { orgAiCache } from "@/lib/graph/ai-cache";
import { loadAnalysis, recordStage } from "@/lib/graph/analysis-store";
import { loadFileInput, loadFolderInput, readFileHash, storeModelRole } from "@/lib/graph/explain-context";
import { runAnalysis } from "@/lib/pipeline/run-analysis";

export type ExplainResult =
  | {
      ok: true;
      body: string;
      model: string;
      cached: boolean;
      tracing: TracingStatus;
      labelled: { role: ModelRole | null } | null;
      labelError: string | null;
    }
  | { ok: false; error: string };

export type HeadResult = { ok: true; head: string; analysed: string } | { ok: false; error: string };
export type FileAtHead = { ok: true; state: "unchanged" | "changed" | "deleted" } | { ok: false; error: string };

type CompleteAnalysis = {
  id: string;
  commitSha: string;
  owner: string;
  name: string;
};

export async function explainFileAction(analysisId: string, path: string): Promise<ExplainResult> {
  try {
    const analysis = await readCompleteAnalysis(analysisId);
    const loaded = await loadFileInput(analysis.orgId, analysis.id, path);
    if (!loaded) return { ok: false, error: `${path} isn't a file in this analysis` };
    const cache = orgAiCache(analysis.orgId);
    const source = sourceAtAnalysedCommit(analysis.repository, analysis.commitSha, path, loaded.file.hash);

    let labelled: { role: ModelRole | null } | null = null;
    let labelError: string | null = null;
    const input = loaded.input;
    if (loaded.file.needsClassify && input.role === null) {
      try {
        const { role } = await classifyFile(loaded.classify, { cache, source });
        labelled = { role };
        if (role !== null) {
          await storeModelRole(analysis.orgId, loaded.file.id, role);
          input.role = role;
        }
      } catch (error) {
        labelError = messageOf(error);
      }
    }

    const answer = await explainFile(input, { cache, source });
    return { ok: true, ...answer, tracing: tracingStatus(), labelled, labelError };
  } catch (error) {
    console.error(`Explaining ${path} failed:`, error);
    return { ok: false, error: messageOf(error) };
  }
}

export async function explainFolderAction(analysisId: string, dir: string): Promise<ExplainResult> {
  try {
    const analysis = await readCompleteAnalysis(analysisId);
    const input = await loadFolderInput(analysis.orgId, analysis.id, dir);
    if (!input) return { ok: false, error: `${dir} isn't a folder on this map` };
    const answer = await explainFolder(input, { cache: orgAiCache(analysis.orgId) });
    return { ok: true, ...answer, tracing: tracingStatus(), labelled: null, labelError: null };
  } catch (error) {
    console.error(`Explaining folder ${dir} failed:`, error);
    return { ok: false, error: messageOf(error) };
  }
}

export async function repositoryHeadAction(analysisId: string): Promise<HeadResult> {
  try {
    const analysis = await readCompleteAnalysis(analysisId);
    const head = await resolveHeadCommit(analysis.owner, analysis.name);
    return { ok: true, head, analysed: analysis.commitSha };
  } catch (error) {
    return { ok: false, error: messageOf(error) };
  }
}

export async function fileAtHeadAction(analysisId: string, path: string, head: string): Promise<FileAtHead> {
  try {
    if (!/^[0-9a-f]{40}$/.test(head)) return { ok: false, error: "That isn't a commit" };
    const analysis = await readCompleteAnalysis(analysisId);
    const hash = await readFileHash(analysis.orgId, analysis.id, path);
    if (!hash) return { ok: false, error: `${path} isn't a parsed file in this analysis` };
    const bytes = await fetchFileAt(analysis.repository, head, path);
    if (bytes === null) return { ok: true, state: "deleted" };
    return { ok: true, state: sha256(bytes) === hash ? "unchanged" : "changed" };
  } catch (error) {
    return { ok: false, error: messageOf(error) };
  }
}

export async function reanalyseAction(analysisId: string): Promise<{ error: string | null }> {
  const { orgId } = await auth();
  if (!orgId) return { error: "Choose an organization first." };

  const analysis = await loadAnalysis(orgId, analysisId);
  if (!analysis) return { error: "Analysis not found." };
  if (analysis.status === "running" || analysis.status === "queued") {
    return { error: "It's already running." };
  }

  await recordStage(orgId, analysisId, {
    status: "queued",
    stage: "fetch",
    message: "Waiting to fetch.",
    commitSha: null,
    finished: false,
    error: null,
  });
  after(() => runAnalysis(orgId, analysisId, analysis.owner, analysis.name));
  return { error: null };
}

async function readCompleteAnalysis(analysisId: string): Promise<CompleteAnalysis & { orgId: string; repository: Repository }> {
  const { orgId } = await auth();
  if (!orgId) throw new Error("Choose an organization first.");
  const analysis = await loadAnalysis(orgId, analysisId);
  if (!analysis) throw new Error("Analysis not found.");
  if (analysis.status !== "complete" || !analysis.commitSha) {
    throw new Error("This analysis isn't complete");
  }
  return {
    orgId,
    id: analysis.id,
    commitSha: analysis.commitSha,
    owner: analysis.owner,
    name: analysis.name,
    repository: { owner: analysis.owner, name: analysis.name },
  };
}

function sourceAtAnalysedCommit(
  repository: Repository,
  commitSha: string,
  path: string,
  hash: string,
): () => Promise<string> {
  let pending: Promise<string> | null = null;
  return () => {
    pending ??= (async () => {
      const bytes = await fetchFileAt(repository, commitSha, path);
      if (bytes === null) {
        throw new Error(`GitHub has no ${path} at ${commitSha.slice(0, 7)}, the commit that was analysed`);
      }
      if (sha256(bytes) !== hash) {
        throw new Error(`GitHub's copy of ${path} at ${commitSha.slice(0, 7)} isn't what was parsed`);
      }
      return bytes.toString("utf8");
    })();
    return pending;
  };
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
