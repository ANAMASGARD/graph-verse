# Phase 2 — Dashboard and schema

**Goal.** The workspace exists, it belongs to one team, and it can prove that.

## Build

- The first graph schema, applied from a version-controlled Cypher script (not
  by hand in the FalkorDB browser). One FalkorDB graph per Clerk organization,
  named by that organization's id.
- **Node labels and relationships** that carry what the tutorial stored in
  Postgres tables:
  - `Project` — repo owner and name. One `Analysis` per project.
  - `Analysis` — status, stage, stage message, commit sha, coverage payload,
    error, timestamps.
  - `File` — path, module, lines, bytes, hash, fan-in, fan-out, skip reason and
    skip detail when skipped; role and role source when assigned.
  - Typed relationships between parsed files: `IMPORTS`, `RE_EXPORTS`,
    `DYNAMIC_IMPORT`, `REQUIRES`, each with specifier, line, and type-only.
    Only resolved imports become edges; unresolved ones stay in coverage only.
  - `Route` nodes linked to the file they were recovered from.
  - `Insight` nodes linked to an analysis.
- Indexes on properties used for lookup (analysis id, file path, project key).
- The dashboard: the list of analyses in the current organization's graph, what
  state each one is in, and an empty state for a team that has never run one.
- Seeded data in two organization graphs, because nothing creates a real run yet.

## Constraints

- Authorization is which graph is selected, not a filter in application code.
  Server code reads the org id from the token and calls `selectGraph(orgId)`
  before any read or write. If another organization's analysis appears on the
  dashboard, the wrong graph was opened.
- Schema scripts are files tracked in version control, not one-off clicks in the
  browser.
- The dashboard query does not include a manual `where organization_id = …`.
  Tenancy is the graph boundary.
- Switching organization changes what the same page shows, without a different
  query shape being written for it — only the graph name changes.
- Do not create an `AiCache` label or explanation storage here. That arrives in
  phase 10.

## Acceptance check

1. With analyses seeded for two different organizations: signed in to the
   first, the dashboard lists only that organization's analyses. Switch
   organization, the list changes, and the Cypher pattern did not change.
2. In FalkorDB, org A's graph contains none of org B's `Analysis` or `File`
   nodes. Check with a read query in each graph, not a sample from one.

## Not in this phase

The "analyse a repository" form. There is nothing behind it to call yet, and a
button that does nothing for a long stretch is worse than no button.
