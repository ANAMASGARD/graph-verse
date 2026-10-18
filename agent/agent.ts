import { z } from "zod";

import { defineDeepAgent } from "managed-deepagents";

import { listRole, neighbours, routes, searchFiles, summary, walk } from "./tools/graph";

// The credential is run context for the tools. It is not part of the prompt.
export const agent = defineDeepAgent({
  name: "graph-verse",
  model: "openai:gpt-5.4-mini-2026-03-17",
  tools: [summary, searchFiles, listRole, neighbours, walk, routes],
  contextSchema: z.object({
    credential: z.string(),
  }),
});
