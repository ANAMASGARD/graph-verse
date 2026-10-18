import "server-only";

import OpenAI from "openai";
import { wrapOpenAI } from "langsmith/wrappers/openai";

// The one place the AI client is constructed. A client built anywhere else
// would work and silently go untraced, so nothing else imports "openai".

export const MODELS = {
  explain: "gpt-5.5-2026-04-23",
  classify: "gpt-5.4-mini-2026-03-17",
} as const;

export type TracingStatus = { on: true; project: string } | { on: false; reason: string };

export function tracingStatus(): TracingStatus {
  if (process.env.LANGSMITH_TRACING?.trim() !== "true") {
    return { on: false, reason: 'LANGSMITH_TRACING isn\'t "true"' };
  }
  if (!process.env.LANGSMITH_API_KEY?.trim()) {
    return { on: false, reason: "LANGSMITH_API_KEY isn't set" };
  }
  return { on: true, project: process.env.LANGSMITH_PROJECT?.trim() || "default" };
}

let client: OpenAI | null = null;

export function ai(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY isn't set in .env.local, so nothing can be explained");
  }
  client = wrapOpenAI(new OpenAI({ apiKey }), { tracingEnabled: tracingStatus().on });
  return client;
}

export function traceConfig(name: string) {
  return { name, run_type: "chain", tracingEnabled: tracingStatus().on } as const;
}
