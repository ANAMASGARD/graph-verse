# FalkorDB in Graph Verse

Graph Verse follows the [JavaScript Mastery Cartograph tutorial](https://youtu.be/-AkIj8TG3Uc) and its [reference repo](https://github.com/adrianhajdin/cartograph) for product behaviour. That build stores analyses in **Supabase Postgres** with eight tables, **row-level security** on every table, and **Supabase Realtime** for pipeline progress ([schema migration](https://raw.githubusercontent.com/adrianhajdin/cartograph/main/supabase/migrations/20260928085353_schema.sql), [progress channel](https://raw.githubusercontent.com/adrianhajdin/cartograph/main/supabase/migrations/20260928174534_progress_channel.sql)).

This project replaces Postgres with **FalkorDB** so the dependency map is a real property graph and hackathon agents can query it with OpenCypher.

## Why FalkorDB fits

- **Multi-graph tenancy:** separate graphs per tenant ([FalkorDB docs — multiple graphs](https://github.com/FalkorDB/docs/blob/main/operations/falkordblite/falkordblite-ts.mdx)). Graph Verse uses one graph per Clerk organization id.
- **OpenCypher:** files as nodes, imports as typed relationships ([FalkorDB Cypher reference](https://github.com/FalkorDB/docs/blob/main/cypher/index.mdx)).
- **TypeScript client:** `FalkorDB.connect`, `selectGraph`, parameterized queries ([falkordb-ts quick start](https://github.com/FalkorDB/falkordb-ts/blob/main/_autodocs/QUICK_START.md)).

FalkorDB does **not** provide Postgres-style RLS or trigger-based realtime. Tenancy is **which graph is selected**; live progress uses **Redis pub/sub** on `analysis:{id}` when the pipeline updates stage (see phase 7 spec).

## Cartograph tables → Graph Verse graph model

| Cartograph (Postgres) | Graph Verse (FalkorDB) |
| --------------------- | ---------------------- |
| `organizations` | Implicit: graph name = Clerk org id |
| `projects` | `:Project` |
| `analyses` | `:Analysis` linked to project |
| `files` | `:File` linked to analysis |
| `edges` | `IMPORTS`, `RE_EXPORTS`, `DYNAMIC_IMPORT`, `REQUIRES` between `:File` nodes |
| `routes` | `:Route` linked to `:File` |
| `file_roles` | `role`, `roleSource` on `:File` |
| `insights` | `:Insight` linked to analysis |
| `ai_cache` (later migration) | `:AiCache` in org graph (phase 10) |

Unresolved imports stay in the analysis **coverage** payload, not as relationships — same rule as Cartograph (only resolved imports are edges).

## Local development

- Database: Docker `falkordb/falkordb:latest`, Redis port **6379**, browser UI on **3001** (Next.js keeps **3000**).

```bash
docker volume create falkordb-data
docker run -d \
  --name falkordb \
  -p 127.0.0.1:6379:6379 \
  -p 127.0.0.1:3001:3000 \
  -v falkordb-data:/var/lib/falkordb/data \
  falkordb/falkordb:latest
docker exec falkordb redis-cli PING   # expect PONG
```

- Cursor: project [`.cursor/mcp.json`](../.cursor/mcp.json) with [`@falkordb/mcpserver`](https://github.com/FalkorDB/FalkorDB-MCPServer). Reload MCP in Settings → Tools & MCP after adding the file.
- CLI fallback: `docker exec falkordb redis-cli GRAPH.LIST` and `GRAPH.QUERY`.

## References

- [Cartograph README / stack](https://github.com/adrianhajdin/cartograph)
- [FalkorDB TypeScript SDK](https://github.com/FalkorDB/falkordb-ts)
- [FalkorDB documentation](https://github.com/FalkorDB/docs)
- [FalkorDB MCP Server](https://github.com/FalkorDB/FalkorDB-MCPServer)
