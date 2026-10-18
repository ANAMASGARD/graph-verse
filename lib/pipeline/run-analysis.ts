import "server-only";

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { downloadArchive, fetchCommitSha, selectRepositoryRoot } from "@/lib/github/archive";
import { recordStage, storeParseResult } from "@/lib/graph/analysis-store";
import type { AnalysisStage } from "@/lib/graph/analysis-types";
import { parseRepository } from "@/parser/parse-repository.mts";

const STAGE_MESSAGE: Record<AnalysisStage, string> = {
  fetch: "Fetching the public archive.",
  select: "Selecting the repository root.",
  parse: "Parsing imports.",
  store: "Storing the graph.",
};

export async function runAnalysis(
  orgId: string,
  analysisId: string,
  owner: string,
  name: string,
): Promise<void> {
  let stage: AnalysisStage = "fetch";
  const directory = await mkdtemp(path.join(tmpdir(), "graph-verse-"));
  try {
    await recordStage(orgId, analysisId, {
      status: "running",
      stage,
      message: STAGE_MESSAGE.fetch,
      commitSha: null,
      finished: false,
      error: null,
    });
    const sha = await fetchCommitSha(owner, name);
    const archive = await downloadArchive(owner, name, sha, directory);
    await recordStage(orgId, analysisId, {
      status: "running",
      stage,
      message: STAGE_MESSAGE.fetch,
      commitSha: sha,
      finished: false,
      error: null,
    });

    stage = "select";
    await recordStage(orgId, analysisId, {
      status: "running",
      stage,
      message: STAGE_MESSAGE.select,
      commitSha: sha,
      finished: false,
      error: null,
    });
    const root = await selectRepositoryRoot(archive, directory);

    stage = "parse";
    await recordStage(orgId, analysisId, {
      status: "running",
      stage,
      message: STAGE_MESSAGE.parse,
      commitSha: sha,
      finished: false,
      error: null,
    });
    const result = await parseRepository(root);

    stage = "store";
    await recordStage(orgId, analysisId, {
      status: "running",
      stage,
      message: STAGE_MESSAGE.store,
      commitSha: sha,
      finished: false,
      error: null,
    });
    await storeParseResult(orgId, analysisId, sha, result);
    await recordStage(orgId, analysisId, {
      status: "complete",
      stage,
      message: "Stored.",
      commitSha: sha,
      finished: true,
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The run failed.";
    try {
      await recordStage(orgId, analysisId, {
        status: "failed",
        stage,
        message,
        commitSha: null,
        finished: true,
        error: message,
      });
    } catch {
      // The failure itself could not be written. The dashboard will show the
      // unfinished run as stale once it is a few minutes old.
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
