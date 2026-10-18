# Graph Verse — session memory

Last updated after phase 2 + dashboard UI work (post `3115ba5`).

## Product

Next.js 16 App Router app that maps public GitHub repos via parsing + FalkorDB. Rules: `AGENTS.md`, specs in `specs/phase-NN.md`. One FalkorDB **graph per Clerk organization id**; tenancy is `selectGraph(orgId)`, not SQL-style org filters.

## Clerk (development instance)

- App linked via Clerk CLI; organizations **enabled** with **membership required**, **auto-create first org**, **force org selection**.
- Paths patched: `home` and sign-in/up → `/sign-in`, `/sign-up` (invites land on sign-in).
- Landing: modal sign-in/up; **Get Started** uses `Show` — signed-in users link to `/dashboard`, not sign-up modal (single-session fix).
- Protected routes: `proxy.ts` + `auth.protect()` on `/dashboard(.*)`.
- Session task: `/session-tasks/choose-organization` + `ClerkProvider` `taskUrls`.
- Theme: cookie `gv-theme` (`system` | `light` | `dark`); **default when unset is `dark`** (`lib/theme.ts`, boot script). Applied on `<html>` via `.dark` + `next/script` `beforeInteractive` (not raw `<script>` in layout).

## FalkorDB

- Cloud dev instance; app uses `.env.local`: `FALKORDB_HOST`, `PORT`, `USERNAME`, `PASSWORD`, **`FALKORDB_TLS=false`** (TLS true timed out).
- Server-only: `lib/falkordb-config.ts`, `lib/falkordb-client.ts`, `instrumentation.ts` ping at startup.
- Org access: `lib/falkordb-org-graph.ts` → `getOrgGraph(orgId)`.
- Schema (version-controlled): `db/schema/001-graph-schema.cypher` — labels/relationships documented in file; indexes on Analysis.id, File.path, Project repo fields.
- Scripts: `npm run verify:falkordb`, `npm run db:apply-schema`, `npm run db:seed` (see `scripts/`).
- Seed env (not committed): `GRAPH_VERSE_SEED_ORG_A`, `GRAPH_VERSE_SEED_ORG_B` — two Clerk org ids; seed puts demo analyses in A (2 runs) and B (1 failed), with sample File/IMPORTS/Route/Insight on complete run.

## Phase status

| Phase | Status |
|-------|--------|
| **1** Auth, orgs, theme, shell, FalkorDB boot | Built; user runs acceptance in browser |
| **2** Schema, org-scoped list, seed, dashboard | Built; list via fixed Cypher, no org filter in query |
| **3+** | Not started |

## Dashboard UI (workspace)

- Route: `app/(app)/dashboard/page.tsx` — SSR org name from Clerk API (display only); analyses from `listAnalysesForOrg(orgId)`.
- Components: `components/app-shell.tsx`, `components/analysis-dashboard.tsx`, `components/theme-toggle.tsx`.
- Fonts (app routes only): Syne, Figtree, IBM Plex Mono in `app/(app)/layout.tsx`; styles in `app/workspace.css`.
- Layout: full-width `.workspace-container` with responsive gutters; Cartograph-like table (Repository, State, Commit, Started, Finished); status glyphs ○ ◐ ● ⊗; relative times; larger bold typography (16px base).
- Data: `lib/graph/list-analyses.ts` returns `startedAt`, `finishedAt`, status, stageMessage, repo owner/name.

## MCP / local

- Project `.cursor/mcp.json`: FalkorDB MCP with `envFile` → `.env.local`.
- Optional local Podman `falkordb`; production path for app/MCP is Cloud per `.env.local`.

## Git

- Remote: `origin/main` on `ANAMASGARD/graph-verse`.
- Do not commit `.env.local` or credentials.

## User acceptance (manual)

- Phase 1: five checks in `specs/phase-01.md`.
- Phase 2: switch orgs on dashboard; verify isolated graphs in FalkorDB per org id.
