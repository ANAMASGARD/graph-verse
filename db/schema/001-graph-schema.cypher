// Graph Verse — per-organization graph model (Cartograph tables → property graph).
//
// Nodes
//   :Project     repoOwner, repoName, id, createdAt
//   :Analysis    id, status, stage, stageMessage, commitSha, coverage (JSON string),
//                error, createdAt, startedAt, finishedAt, schemaVersion
//   :File        id, path, module, lines, bytes, hash, fanIn, fanOut,
//                skipReason, skipDetail, role, roleSource
//   :Route       id, method, path, line
//   :Insight     id, body, createdAt
//
// Relationships
//   (Project)-[:HAS_ANALYSIS]->(Analysis)     one analysis per project
//   (Analysis)-[:HAS_FILE]->(File)
//   (File)-[:IMPORTS|:RE_EXPORTS|:DYNAMIC_IMPORT|:REQUIRES]->(File)
//     properties: specifier, line, typeOnly
//   (Analysis)-[:HAS_ROUTE]->(Route)-[:DEFINED_IN]->(File)
//   (Analysis)-[:HAS_INSIGHT]->(Insight)
//
// Unresolved imports live in Analysis.coverage only — never as edges.

CREATE INDEX FOR (a:Analysis) ON (a.id);
CREATE INDEX FOR (f:File) ON (f.path);
CREATE INDEX FOR (p:Project) ON (p.repoOwner);
CREATE INDEX FOR (p:Project) ON (p.repoName);
