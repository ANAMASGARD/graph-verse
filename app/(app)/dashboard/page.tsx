import { AnalysisDashboard } from "@/components/analysis-dashboard";
import { listAnalysesForOrg } from "@/lib/graph/list-analyses";
import { auth, clerkClient } from "@clerk/nextjs/server";

export default async function DashboardPage() {
  const { orgId, orgSlug } = await auth();

  if (!orgId) {
    return (
      <section className="brutal-surface px-5 py-6">
        <h1 className="workspace-display text-lg font-semibold">Workspace</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose an organization from the header switcher to open its graph.
        </p>
      </section>
    );
  }

  const clerk = await clerkClient();
  const [analyses, orgRecord] = await Promise.all([
    listAnalysesForOrg(orgId),
    clerk.organizations.getOrganization({ organizationId: orgId }),
  ]);

  const orgName = orgRecord.name ?? orgSlug ?? "Team";

  return <AnalysisDashboard orgName={orgName} analyses={analyses} />;
}
