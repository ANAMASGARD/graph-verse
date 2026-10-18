# Graph Verse — session memory

Last updated after phase 7 (pipeline).

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
| **3** Parser: files, edges, coverage, fallback adapter | Built; terminal only |
| **4** Canvas: fold to ~24 nodes, three columns | Built; checked-in preview removed in phase 7 |
| **5** Detail pane: summary, file, folder, hover | Built |
| **6** Blast radius, dependency chain, insights, rail filter | Built; walks the edges already in the browser |
| **7** Fetch, parse, store a public GitHub repo | Built; user runs the paste-and-watch checks |
| **8+** | Not started |

## Parser

- Command: `npm run parse -- <directory> [--out result.json]`. Read back: `npm run parse -- --read result.json`.
- Code in `parser/`. No Next, React, or FalkorDB. Uses the TypeScript compiler API already installed (the parser under ts-morph).
- Contract is the JSON result: parsed files carry `folder`, `module`, lines, bytes, sha256, fan-in, fan-out; skipped files carry a reason; edges are `IMPORTS`, `RE_EXPORTS`, `DYNAMIC_IMPORT`. Unresolved imports stay in `coverage.failures` with a reason. Only resolved imports are edges.
- Walks whole directories. Never enters `node_modules` or `.git`. Other exclusions come from the repo's `.gitignore`, reported per directory. `require()` is not collected.
- Adapter list is the fallback only (`framework: none`, role `file`).

## Map

- Explorer: `components/explorer/`. Three columns stay put: rail, map, detail pane.
- Folding (`lib/map/fold.mts`): deepest-first, threshold starts at 2, rises until under 24 nodes. Hono `src` folded to 22 nodes at threshold 5 before the preview file was deleted.
- Detail pane: repository summary at rest; a file shows path, kind, lines, and neighbour lists; a folder shows role counts. Structure / Explanation tabs. Explanation stays empty. Hover links a path and its node.
- Blast radius (incoming) and dependency chain (outgoing) are a two-hop walk (`lib/map/walk.mts`), same bound as FalkorDB `*1..2`. No request on click.
- Insights (`lib/map/insights.mts`), collapsed at the bottom of the pane: nothing-imports (pages, routes, layouts, middleware, and config are excluded), unusual fan-in (mean + 2 standard deviations), import cycles (iterative), files over 1000 lines.
- Rail click dims every file that is not that role and prints a match count on each panel. Counts add up to the rail total.
- Preview route and `data/preview-graph.json` are gone. The map reads the analysis stored for the org.

## Pipeline (phase 7)

- Dashboard form: public `github.com/owner/name` only. No token, no Authorization header.
- Stages, in order: **fetch**, **select**, **parse**, **store**. A thrown error writes `failed` plus the stage and the reason on the `Analysis` node. One analysis per owner/name; pasting the same URL opens the existing one.
- Run starts with `after()` so the progress page can render while it works. Archive is a public tarball. The commit sha is stored. Select keeps the single top directory inside the archive.
- Page: `/dashboard/analyses/[id]`. While running, the four stage names tick from a server-sent event at `/dashboard/analyses/[id]/events`. The stream checks the analysis id is in the current org graph before it attaches. Payload is `{status, stage, message}` only.
- The FalkorDB user cannot `SUBSCRIBE`. Progress is an in-process bus on `globalThis`, not Redis pub/sub. The browser never opens FalkorDB.
- Unfinished (`queued` or `running`) for 5 minutes shows as **stale** on the dashboard. That mark is display-only.
- A partial graph keeps a one-line coverage banner (`Partial · N% of files parsed`). It can expand; the percent stays on the collapsed line.
- Store: `lib/graph/analysis-store.ts`. Parsed files and skipped files are `:File` nodes; edges are `IMPORTS`, `RE_EXPORTS`, `DYNAMIC_IMPORT`.

## Dashboard UI (workspace)

- Route: `app/(app)/dashboard/page.tsx` — SSR org name from Clerk API (display only); analyses from `listAnalysesForOrg(orgId)`.
- Components: `components/app-shell.tsx`, `components/analysis-dashboard.tsx`, `components/repository-form.tsx`, `components/theme-toggle.tsx`.
- Fonts (app routes only): Syne, Figtree, IBM Plex Mono in `app/(app)/layout.tsx`; styles in `app/workspace.css`. Map styles: `app/(app)/dashboard/analyses/[id]/explorer.css`.
- Shell main is full-bleed. The dashboard page adds `.workspace-container`. The map fills the space under the header.
- Table: Repository, State, Commit, Started, Finished. Status glyphs ○ ◐ ● ⊗. Repository name links to the analysis. A second dashboard tab follows stage changes through the same event stream.

## MCP / local

- Project `.cursor/mcp.json`: FalkorDB MCP with `envFile` → `.env.local`.
- Optional local Podman `falkordb`; production path for app/MCP is Cloud per `.env.local`.

## Git

- Remote: `origin/main` on `ANAMASGARD/graph-verse`.
- Do not commit `.env.local` or credentials.

## User acceptance (manual)

- Phase 1: five checks in `specs/phase-01.md`.
- Phase 2: switch orgs on dashboard; verify isolated graphs in FalkorDB per org id.
- Phase 3 acceptance was run in the terminal (this repo, date-fns barrels, rename fixture, JSON round-trip).
- Phases 4–6 were checked in the browser on `/preview` before that route was removed.
- Phase 7: paste a public URL, paste it again, paste a missing repo, watch the stage from a second dashboard tab, and confirm the coverage banner names a percent under 95. Sign-in blocked the agent from running those clicks. Archive download and the graph write were checked from the terminal.
