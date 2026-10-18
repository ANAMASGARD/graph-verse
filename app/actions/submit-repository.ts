"use server";

import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { after } from "next/server";
import { redirect } from "next/navigation";

import { parseGithubRepoUrl } from "@/lib/github/repository-url";
import { createQueuedAnalysis, findAnalysisId } from "@/lib/graph/analysis-store";
import { runAnalysis } from "@/lib/pipeline/run-analysis";

export type SubmitState = { error: string } | null;

export async function submitRepository(_previous: SubmitState, formData: FormData): Promise<SubmitState> {
  const { orgId } = await auth();
  if (!orgId) {
    return { error: "Choose an organization before analysing a repository." };
  }

  const parsed = parseGithubRepoUrl(String(formData.get("url") ?? ""));
  if (!parsed) {
    return { error: "Paste a public GitHub repository URL, like https://github.com/owner/name." };
  }

  const existing = await findAnalysisId(orgId, parsed.owner, parsed.name);
  if (existing) {
    redirect(`/dashboard/analyses/${existing}`);
  }

  const analysisId = randomUUID();
  await createQueuedAnalysis(orgId, analysisId, parsed.owner, parsed.name);
  after(() => runAnalysis(orgId, analysisId, parsed.owner, parsed.name));
  redirect(`/dashboard/analyses/${analysisId}`);
}
