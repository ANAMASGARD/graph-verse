"use server";

import { createHash } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { after } from "next/server";

import { tracingStatus, type TracingStatus } from "@/lib/ai/client";
import type { ModelRole } from "@/lib/ai/model-roles";
import type { FileInput } from "@/lib/ai/prompts";
import { classifyFile, explainFile, explainFolder } from "@/lib/ai/tasks";
import { fetchFileAt, resolveHeadCommit, type Repository } from "@/lib/github/content";
import { orgAiCache } from "@/lib/graph/ai-cache";
import { loadAnalysis, requeueAnalysis } from "@/lib/graph/analysis-store";
import { loadFileInput, loadFolderInput, storeModelRole } from "@/lib/graph/explain-context";
import { runAnalysis } from "@/lib/pipeline/run-analysis";

export type ExplainResult =
  | {
      ok: true;
      body: string;
      model: string;
      cached: boolean;
      tracing: TracingStatus;
      labelled: { role: ModelRole | null; cached: boolean } | null;
      labelError: string | null;
    }
  | { ok: false; error: string };

export type HeadResult = { ok: true; head: string; analysed: string } | { ok: false; error: string };

export type FileAtHeadResult =
  | { ok: true; state: "unchanged" | "changed" | "deleted" }
  | { ok: false; error: string };

export async function explainFileAction(analysisId: string, path: string): Promise<ExplainResult> {
  const ready = await readyAnalysis(analysisId);
  if (!ready.ok) return ready;
  const { orgId, analysis } = ready;
  const commitSha = analysis.commitSha;
  if (commitSha === null) return { ok: false, error: "This analysis has no commit to read." };

  const loaded = await loadFileInput(orgId, analysisId, path);
  if (!loaded) return { ok: false, error: "This analysis has no parsed file at that path." };

  const repository = { owner: analysis.owner, name: analysis.name };
  const source = sourceAt(repository, commitSha, path);
  const cache = orgAiCache(orgId);

  let labelled: { role: ModelRole | null; cached: boolean } | null = null;
  let labelError: string | null = null;
  let input: FileInput = loaded.input;
  if (loaded.file.needsClassify) {
    try {
      const classified = await classifyFile(loaded.classify, { cache, source });
      labelled = { role: classified.role, cached: classified.cached };
      if (classified.role !== null) {
        await storeModelRole(orgId, loaded.file.id, classified.role);
        input = { ...loaded.input, role: classified.role };
      }
    } catch (error) {
      labelError = messageOf(error);
    }
  }

  try {
    const explanation = await explainFile(input, { cache, source });
    return {
      ok: true,
      body: explanation.body,
      model: explanation.model,
      cached: explanation.cached,
      tracing: tracingStatus(),
      labelled,
      labelError,
    };
  } catch (error) {
    return { ok: false, error: messageOf(error) };
  }
}

export async function explainFolderAction(analysisId: string, dir: string): Promise<ExplainResult> {
  const ready = await readyAnalysis(analysisId);
  if (!ready.ok) return ready;

  const input = await loadFolderInput(ready.orgId, analysisId, dir);
  if (!input) return { ok: false, error: "That folder isn't on the map." };

  try {
    const explanation = await explainFolder(input, { cache: orgAiCache(ready.orgId) });
    return {
      ok: true,
      body: explanation.body,
      model: explanation.model,
      cached: explanation.cached,
      tracing: tracingStatus(),
      labelled: null,
      labelError: null,
    };
  } catch (error) {
    return { ok: false, error: messageOf(error) };
  }
}

export async function repositoryHeadAction(analysisId: string): Promise<HeadResult> {
  const ready = await readyAnalysis(analysisId);
  if (!ready.ok) return ready;
  if (ready.analysis.commitSha === null) {
    return { ok: false, error: "This analysis has no commit to compare." };
  }
  try {
    const head = await resolveHeadCommit(ready.analysis.owner, ready.analysis.name);
    return { ok: true, head, analysed: ready.analysis.commitSha };
  } catch (error) {
    return { ok: false, error: messageOf(error) };
  }
}

export async function fileAtHeadAction(analysisId: string, path: string, head: string): Promise<FileAtHeadResult> {
  const ready = await readyAnalysis(analysisId);
  if (!ready.ok) return ready;
  const loaded = await loadFileInput(ready.orgId, analysisId, path);
  if (!loaded) return { ok: false, error: "This analysis has no parsed file at that path." };
  try {
    const buffer = await fetchFileAt({ owner: ready.analysis.owner, name: ready.analysis.name }, head, path);
    if (!buffer) return { ok: true, state: "deleted" };
    const hash = createHash("sha256").update(buffer).digest("hex");
    return { ok: true, state: hash === loaded.file.hash ? "unchanged" : "changed" };
  } catch (error) {
    return { ok: false, error: messageOf(error) };
  }
}

export async function reanalyseAction(analysisId: string): Promise<{ error: string | null }> {
  const orgId = await currentOrgId();
  if (!orgId) return { error: "Choose an organization first." };
  const analysis = await loadAnalysis(orgId, analysisId);
  if (!analysis) return { error: "This analysis isn't in the current organization." };

  const queued = await requeueAnalysis(orgId, analysisId);
  switch (queued) {
    case "ok":
      after(() => runAnalysis(orgId, analysis.id, analysis.owner, analysis.name));
      return { error: null };
    case "missing":
      return { error: "This analysis isn't in the current organization." };
    case "busy":
      return { error: "This analysis is already running." };
    default: {
      const unreachable: never = queued;
      return unreachable;
    }
  }
}

async function readyAnalysis(analysisId: string): Promise<
  | { ok: true; orgId: string; analysis: NonNullable<Awaited<ReturnType<typeof loadAnalysis>>> }
  | { ok: false; error: string }
> {
  const orgId = await currentOrgId();
  if (!orgId) return { ok: false, error: "Choose an organization first." };
  const analysis = await loadAnalysis(orgId, analysisId);
  if (!analysis) return { ok: false, error: "This analysis isn't in the current organization." };
  if (analysis.status !== "complete") {
    return { ok: false, error: "This analysis hasn't finished, so there's nothing to explain." };
  }
  return { ok: true, orgId, analysis };
}

async function currentOrgId(): Promise<string | null> {
  const { orgId } = await auth();
  return orgId ?? null;
}

function sourceAt(repository: Repository, sha: string, path: string): () => Promise<string> {
  let pending: Promise<string> | null = null;
  return () => {
    pending ??= loadSource(repository, sha, path);
    return pending;
  };
}

async function loadSource(repository: Repository, sha: string, path: string): Promise<string> {
  const buffer = await fetchFileAt(repository, sha, path);
  if (!buffer) throw new Error(`GitHub has no ${path} at ${sha.slice(0, 7)}.`);
  return buffer.toString("utf8");
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "The request failed.";
}
