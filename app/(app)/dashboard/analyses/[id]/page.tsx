import { notFound } from "next/navigation";

import { auth } from "@clerk/nextjs/server";

import { AnalysisProgress } from "@/components/analysis-progress";
import { Explorer } from "@/components/explorer/explorer";
import { loadAnalysis, loadMap } from "@/lib/graph/analysis-store";
import { loadModelRoles } from "@/lib/graph/explain-context";
import { isPartialCoverage } from "@/lib/map/coverage.mts";

export const dynamic = "force-dynamic";

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { orgId } = await auth();
  if (!orgId) notFound();

  const { id } = await params;
  const analysis = await loadAnalysis(orgId, id);
  if (!analysis) notFound();

  if (analysis.status !== "complete") {
    return (
      <div className="workspace-container py-8">
        <AnalysisProgress
          analysisId={analysis.id}
          owner={analysis.owner}
          name={analysis.name}
          createdAt={analysis.createdAt}
          startedAt={analysis.startedAt}
          initial={{
            status: analysis.status,
            stage: analysis.stage,
            message: analysis.error ?? analysis.stageMessage ?? "",
          }}
        />
      </div>
    );
  }

  const map = await loadMap(orgId, id);
  const modelRoles = await loadModelRoles(orgId, id);
  const coverage = analysis.coverage && isPartialCoverage(analysis.coverage) ? analysis.coverage : null;
  const commitSha = analysis.commitSha ?? "";

  return (
    <div className="analysis-map">
      <Explorer
        analysisId={analysis.id}
        commitSha={commitSha}
        repository={`${analysis.owner}/${analysis.name}`}
        framework={analysis.framework}
        importCount={analysis.importCount}
        routes={map.routes}
        files={map.files}
        edges={map.edges}
        coverage={coverage}
        initialModelRoles={modelRoles}
      />
    </div>
  );
}
