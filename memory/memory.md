# Graph Verse — session memory

Last updated after phase 11 (evals: invented-path, role accuracy, prompt versions).

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
- Schema (version-controlled): `db/schema/001-graph-schema.cypher` — labels/relationships documented in file; indexes on Analysis.id, File.path, Project repo fields, AiCache.key.
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
| **8** Next, Nest, and React adapters; route table; rail per framework | Built; user runs the browser checks |
| **9** `require()`, CommonJS export names, Express adapter | Built; user runs the browser checks |
| **10** Explain, cache, trace, classify | Built and pushed; user runs acceptance in browser |
| **11** Evals: invented-path, role accuracy, prompt versions | Built; user runs the three scripts |
| **12+** | Not started |

## Parser

- Command: `npm run parse -- <directory> [--out result.json]`. Read back: `npm run parse -- --read result.json`.
- Code in `parser/`. No Next, React, or FalkorDB. Uses the TypeScript compiler API already installed (the parser under ts-morph). Phase 9 added `parser/extract-exports.mts` and `parser/adapters/express.mts`.
- Contract is the JSON result: parsed files carry `folder`, `module`, lines, bytes, sha256, fan-in, fan-out, and `exports` (CommonJS names, or `module.exports` when a spread or computed key hides them); skipped files carry a reason; edges are `IMPORTS`, `RE_EXPORTS`, `DYNAMIC_IMPORT`, `REQUIRES`. Unresolved imports stay in `coverage.failures` with a reason. Only resolved imports are edges.
- Walks whole directories. Never enters `node_modules` or `.git`. Other exclusions come from the repo's `.gitignore`, reported per directory. `require("literal")` is a `REQUIRES` edge, resolved by the same function as imports. `import x = require("y")` stays an `IMPORTS` edge. A non-literal `require` is unresolved and counts in the coverage denominator. The same file and target can have both an `IMPORTS` and a `REQUIRES` edge; two requires of one file are one edge.
- Adapter list, first match wins: Next.js, NestJS, Express, React, then the fallback (`framework: none`, role `file`). Express matches a file that imports or requires `express`. Roles come from the nearest folder, singular or plural: Routers, Controllers, Services, Models, Middleware. The route table stays empty. The word `nextjs` stays in the Next adapter. Rail category names live in `lib/map/taxonomy.mts`.

## Map

- Explorer: `components/explorer/`. Three columns stay put: rail, map, detail pane.
- Folding (`lib/map/fold.mts`): deepest-first, threshold starts at 2, rises until under 24 nodes. Hono `src` folded to 22 nodes at threshold 5 before the preview file was deleted.
- Detail pane: repository summary at rest; a file shows path, kind, lines, and neighbour lists; a folder shows role counts. Structure / Explanation tabs. Explanation tab: Explain (file or folded folder), subset markdown renderer with path links, LangSmith-traced calls, FalkorDB `:AiCache`, staleness vs GitHub HEAD, Re-analyse. Fallback files get model roles (`service`, `repository`, `model`, `util`, `config`, `component`, `hook` only). Hover links a path and its node.
- Blast radius (incoming) and dependency chain (outgoing) are a two-hop walk (`lib/map/walk.mts`), same bound as FalkorDB `*1..2`. No request on click.
- Insights (`lib/map/insights.mts`), collapsed at the bottom of the pane: nothing-imports (pages, routes, layouts, middleware, and config are excluded), unusual fan-in (mean + 2 standard deviations), import cycles (iterative), files over 1000 lines.
- Rail order comes from the framework: Next.js is Page routes, API endpoints, Server actions, then the layers and plumbing. NestJS is Controllers, Services, Modules, Entities. Express is Routers, Controllers, Services, Models, Middleware. A zero stays put. Anything the adapter didn't name is `file` at the end. Click still dims every other file.
- Preview route and `data/preview-graph.json` are gone. The map reads the analysis stored for the org.

## Pipeline (phase 7)

- Dashboard form: public `github.com/owner/name` only. No token, no Authorization header.
- Stages, in order: **fetch**, **select**, **parse**, **store**. A thrown error writes `failed` plus the stage and the reason on the `Analysis` node. One analysis per owner/name; pasting the same URL opens the existing one.
- Run starts with `after()` so the progress page can render while it works. Archive is a public tarball. The commit sha is stored. Select keeps the single top directory inside the archive.
- Page: `/dashboard/analyses/[id]`. While running, the four stage names tick from a server-sent event at `/dashboard/analyses/[id]/events`. The stream checks the analysis id is in the current org graph before it attaches. Payload is `{status, stage, message}` only.
- The FalkorDB user cannot `SUBSCRIBE`. Progress is an in-process bus on `globalThis`, not Redis pub/sub. The browser never opens FalkorDB.
- Unfinished (`queued` or `running`) for 5 minutes shows as **stale** on the dashboard. That mark is display-only.
- A partial graph keeps a one-line coverage banner (`Partial · N% of files parsed`). It can expand; the percent stays on the collapsed line.
- Store: `lib/graph/analysis-store.ts`. Parsed files and skipped files are `:File` nodes; edges are `IMPORTS`, `RE_EXPORTS`, `DYNAMIC_IMPORT`, `REQUIRES`. CommonJS export names are stored on `:File`. Routes are `:Route` nodes (`method`, `path`, `line`) linked with `HAS_ROUTE` and `DEFINED_IN`. The detail pane lists them.

## Dashboard UI (workspace)

- Route: `app/(app)/dashboard/page.tsx` — SSR org name from Clerk API (display only); analyses from `listAnalysesForOrg(orgId)`.
- Components: `components/app-shell.tsx`, `components/analysis-dashboard.tsx`, `components/repository-form.tsx`, `components/theme-toggle.tsx`.
- Fonts (app routes only): Syne, Figtree, IBM Plex Mono in `app/(app)/layout.tsx`; styles in `app/workspace.css`. Map styles: `app/(app)/dashboard/analyses/[id]/explorer.css`.
- Shell main is full-bleed. The dashboard page adds `.workspace-container`. The map fills the space under the header.
- Table: Repository, State, Commit, Started, Finished. Status glyphs ○ ◐ ● ⊗. Repository name links to the analysis. A second dashboard tab follows stage changes through the same event stream.

## AI (phase 10)

- Single client: `lib/ai/client.ts` (`wrapOpenAI`, pinned models in `MODELS`). Tasks in `lib/ai/tasks.ts` — cache read **inside** `traceable()` so hits show as runs with no model call.
- Explain / classify prompts: `lib/ai/prompts.ts` (`PROMPT_VERSION` in cache key). Server actions: `app/(app)/dashboard/analyses/[id]/actions.ts` — `explainFileAction`, `explainFolderAction`, `repositoryHeadAction`, `fileAtHeadAction` (sha256 vs stored hash), `reanalyseAction`.
- FalkorDB `:AiCache` nodes: `lib/graph/ai-cache.ts`. Context from stored graph only: `lib/graph/explain-context.ts` (neighbour roles include adapter + **model** roles, not only convention). Source at analysed commit: `lib/github/content.ts` (`fetchFileAt`, `resolveHeadCommit`).
- **Re-analyse:** `requeueAnalysis` in `lib/graph/analysis-store.ts` DETACH DELETEs `:File`, `:Route`, `:Insight` for the analysis, resets Analysis to `queued`/`fetch`, then `after()` → `runAnalysis` on same id.
- UI: `explanation-panel.tsx` (staleness + Re-analyse, tracing line, label outcome), `explanation-text.tsx` (inline code, bullets, bold; paths → map selection). Client `explorer.tsx` keeps explanations and freshness per file/folder key. Map category dim uses `modelRoles` in `map-canvas.tsx`.
- Env in `.env.local` (not committed): `OPENAI_API_KEY`; optional tracing `LANGSMITH_TRACING=true`, `LANGSMITH_API_KEY`, `LANGSMITH_ENDPOINT` (EU: `https://eu.api.smith.langchain.com`), `LANGSMITH_PROJECT=graph-verse`. Pinned models verified listed on OpenAI account.
- Deps: `openai`, `langsmith`. AiCache index applied via `npm run db:apply-schema --from-env` on seed org graphs.
- **Checks:** `tsc` and `npm run build` pass. `npm run lint` fails: `eslint-config-next@14` lacks ESM export for `core-web-vitals` that `eslint.config.mjs` imports (Next 16 / ESLint 9 mismatch; not fixed).

## Evals (phase 11)

- Scripts load `.env` then `.env.local` via `evals/env.mts` (same precedence as Next: local overrides, already-set process env wins). `evals/register.mjs` lets plain Node import the server modules: stubs `server-only`, adds `.ts`/`.mts` to extensionless imports.
- **Invented-path** (`evals/invented-path.mts`): deterministic. A token with a source extension (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.mts`, `.cts`, `.json`) must be in the path set the model was shown (the file or folder, plus every neighbour). Score is 1 or 0. Not a model grading a model.
- `npm run eval:paths` — splice fixture first (catches `lib/not-a-real-file.ts`), then scores recent `explain-file` / `explain-folder` root runs in `LANGSMITH_PROJECT` via `client.runs.query` (last 90 days). Failures print the invented token and the shown set.
- Live: `lib/ai/path-feedback.ts`, called from `explainFile` / `explainFolder` (cache hit and miss), writes LangSmith feedback key `invented_path` on the trace. A feedback failure is logged and does not fail Explain.
- **Role accuracy:** `npm run eval:roles -- <directory>`. Parses with the real parser. Held-out set is only conventional roles the classifier may return: Components→component, Hooks→hook, Config→config, Services→service, Models→model. Pages, routes, controllers are excluded. Role is not in the classify prompt. Needs **≥ 30** files or it exits. This repo had **19** (18 Components, 1 Config) on 2026-10-18, so it correctly refused. No FalkorDB cache write.
- **Prompt versions:** current system prompt stays in `lib/ai/prompts.ts`. Retired prompt is only `evals/retired-prompt.mts` (not imported by the app). `npm run eval:prompts -- <directory>` builds LangSmith dataset `graph-verse-explain` (up to 8 files with a neighbour, source ≤ 24_000 chars; `--refresh` replaces it) and runs two experiments, `explain-current` and `explain-retired`. Each is scored with invented-path (exact) and `useful` from `MODELS.classify`. The script says usefulness is a model's opinion, prints both scores, the delta, and the experiment URLs.
- **Blocker seen:** `npm run eval:paths` splice passed, then LangSmith **403** on listing runs. Org key needs `LANGSMITH_WORKSPACE_ID` in `.env.local` (SDK reads that name) before trace listing or the prompt experiments can run.

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
- Phase 8: five checks in `specs/phase-08.md` — Next and Nest rails and route table, three route spot-checks, generic fallback, `nextjs` only in the adapter. Re-analyse (new URL or delete the old analysis) so stored runs pick up adapters and routes.
- Phase 9: three checks in `specs/phase-09.md`. An Express app that only `require()`s (hackathon-starter: 37 edges, 243 imports seen, Express rail, no routes). Re-analyse so stored runs pick up `REQUIRES`. `expressjs/express` draws edges but stays the fallback adapter, because that repo does not import the `express` package.
- Phase 10: six checks in `specs/phase-10.md` — Explain, markdown subset, cache + LangSmith zero-token second run, folder explain, stale after repo move, model role on unidentified files.
- Phase 11: four checks in `specs/phase-11.md`. Splice check passed in the terminal. Real-trace score, role accuracy (≥30 files), and the two prompt experiments are blocked until `LANGSMITH_WORKSPACE_ID` is set and the role script is pointed at a larger checkout than this repo.
