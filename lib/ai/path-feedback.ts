import "server-only";

import { getCurrentRunTree } from "langsmith/traceable";

import { checkInventedPaths } from "../../evals/invented-path.mts";

const sessions = new Map<string, Promise<string>>();

export async function noteInventedPaths(body: string, shown: readonly string[]): Promise<void> {
  const tree = getCurrentRunTree(true);
  if (!tree?.id || tree.tracingEnabled === false) return;
  const check = checkInventedPaths(body, shown);
  const projectName = tree.project_name || process.env.LANGSMITH_PROJECT || "default";
  try {
    const sessionId = await sessionFor(tree.client, projectName);
    await tree.client.createFeedback({
      runId: tree.id,
      sessionId,
      key: "invented_path",
      score: check.score,
      comment:
        check.invented.length === 0
          ? "Every path-shaped token was shown to the model."
          : `Invented: ${check.invented.join(", ")}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "feedback failed";
    console.error(`invented_path feedback was not recorded: ${message}`);
  }
}

function sessionFor(client: { createProject: (params: { projectName: string; upsert: boolean }) => Promise<{ id: string }> }, projectName: string): Promise<string> {
  const existing = sessions.get(projectName);
  if (existing) return existing;
  const pending = client.createProject({ projectName, upsert: true }).then((project) => project.id);
  sessions.set(projectName, pending);
  return pending;
}
