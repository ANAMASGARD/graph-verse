import { auth } from "@clerk/nextjs/server";

export default async function DashboardPage() {
  const { orgId, orgSlug } = await auth();

  return (
    <section className="border-2 border-border bg-card p-4 shadow-md">
      <h1 className="font-head text-lg">Workspace</h1>
      <p className="mt-2 text-xs text-muted-foreground">
        Signed-in team context comes from the session token. Later phases query
        FalkorDB using the organization id below.
      </p>
      <dl className="mt-4 space-y-2 font-mono text-[11px] leading-snug">
        <div className="flex flex-wrap gap-x-2 gap-y-1 border border-border bg-background px-2 py-1.5">
          <dt className="text-muted-foreground">org slug</dt>
          <dd className="text-foreground">{orgSlug ?? "—"}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-1 border border-border bg-background px-2 py-1.5">
          <dt className="text-muted-foreground">org id</dt>
          <dd className="break-all text-foreground">{orgId ?? "—"}</dd>
        </div>
      </dl>
      <p className="mt-4 text-[10px] text-muted-foreground">
        Invite teammates from the organization menu (Manage organization →
        Members). Accepting an invite sends them to sign-in, then here.
      </p>
    </section>
  );
}
