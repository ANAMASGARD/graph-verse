import { tool, type ToolRuntime } from "langchain";
import { z } from "zod";

const TOOL_URL = process.env.GRAPH_VERSE_TOOL_URL ?? "http://127.0.0.1:3000/api/agent/tools";

type GraphContext = { credential: string };

async function ask(
  body: { [key: string]: string },
  runtime: ToolRuntime<unknown, GraphContext>,
): Promise<string> {
  const credential = runtime.context?.credential;
  if (!credential) {
    throw new Error("This run has no credential, so the graph cannot be read.");
  }
  let response: Response;
  try {
    response = await fetch(TOOL_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${credential}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("The graph service did not answer.");
  }
  const text = await response.text();
  if (!response.ok) throw new Error(text.slice(0, 500));
  return text;
}

export const summary = tool(
  async (_input, runtime: ToolRuntime<unknown, GraphContext>) => ask({ name: "summary" }, runtime),
  {
    name: "summary",
    description: "Summarise the repository: name, framework, file count, import count, route count, and how many files have each role.",
    schema: z.object({}),
  },
);

export const searchFiles = tool(
  async ({ part }, runtime: ToolRuntime<unknown, GraphContext>) => ask({ name: "search", part }, runtime),
  {
    name: "search_files",
    description: "Find files whose path contains this text. Use a fragment of a path, not a guess at a filename that was not returned before.",
    schema: z.object({
      part: z.string().describe("A fragment of a repository path, such as auth or src/lib."),
    }),
  },
);

export const listRole = tool(
  async ({ role }, runtime: ToolRuntime<unknown, GraphContext>) => ask({ name: "role", role }, runtime),
  {
    name: "list_role",
    description: "List files with one stored role. Use a role name from the summary, such as Components or Controllers.",
    schema: z.object({
      role: z.string().describe("The role name exactly as the summary listed it."),
    }),
  },
);

export const neighbours = tool(
  async ({ path }, runtime: ToolRuntime<unknown, GraphContext>) => ask({ name: "neighbours", path }, runtime),
  {
    name: "neighbours",
    description: "List the files one file directly imports and the files that directly import it.",
    schema: z.object({
      path: z.string().describe("A repository path a tool already returned."),
    }),
  },
);

export const walk = tool(
  async ({ path, direction, to }, runtime: ToolRuntime<unknown, GraphContext>) => {
    const body: { [key: string]: string } = { name: "walk", path, direction };
    if (to) body.to = to;
    return ask(body, runtime);
  },
  {
    name: "walk",
    description:
      "Walk imports up to two hops. Direction in lists files that depend on this file. Direction out lists files this file depends on. Pass to when you need the chain from path to one other file.",
    schema: z.object({
      path: z.string().describe("The file to start from. A path a tool already returned."),
      direction: z.enum(["in", "out"]).describe("in: what depends on this file. out: what this file depends on."),
      to: z.string().optional().describe("Stop at this file and return the chain, if one exists within two hops."),
    }),
  },
);

export const routes = tool(
  async (_input, runtime: ToolRuntime<unknown, GraphContext>) => ask({ name: "routes" }, runtime),
  {
    name: "routes",
    description: "List the route table: method, pattern, and the file that defines it.",
    schema: z.object({}),
  },
);
