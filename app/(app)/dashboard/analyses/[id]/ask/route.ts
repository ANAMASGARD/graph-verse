import { auth } from "@clerk/nextjs/server";

import { mintCredential } from "@/lib/agent/credential";
import { recordInquiry } from "@/lib/agent/record";
import { loadAnalysis } from "@/lib/graph/analysis-store";

export const dynamic = "force-dynamic";

const AGENT_URL = process.env.GRAPH_VERSE_AGENT_URL?.trim() || "http://127.0.0.1:2024";
const ASSISTANT = "graph-verse";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { orgId, userId } = await auth();
  if (!orgId) return Response.json({ error: "Choose an organization first." }, { status: 401 });
  const { id } = await context.params;
  const analysis = await loadAnalysis(orgId, id);
  if (!analysis) return Response.json({ error: "This analysis isn't in the current organization." }, { status: 404 });
  if (analysis.status !== "complete") {
    return Response.json({ error: "This analysis hasn't finished, so there's nothing to ask." }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The question was not JSON." }, { status: 400 });
  }
  const question = field(body, "question");
  if (!question) return Response.json({ error: "Ask a question first." }, { status: 400 });
  const selected = field(body, "selected");
  const requestedThread = field(body, "threadId");

  let credential: string;
  try {
    credential = mintCredential(orgId, analysis.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The credential could not be signed.";
    return Response.json({ error: message }, { status: 503 });
  }

  const headers = agentHeaders(userId ?? orgId);
  let threadId = requestedThread;
  try {
    if (!threadId) threadId = await createThread(headers);
  } catch {
    return Response.json(
      { error: "The agent isn't running. The map still works." },
      { status: 503 },
    );
  }

  const message = selected
    ? `The map has this selected: ${selected}\n\n${question}`
    : `The map has nothing selected.\n\n${question}`;
  let upstream: Response;
  try {
    upstream = await fetch(`${AGENT_URL}/threads/${threadId}/runs/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        assistant_id: ASSISTANT,
        input: { messages: [{ role: "user", content: message }] },
        context: { credential },
        stream_mode: ["updates", "messages"],
      }),
    });
  } catch {
    return Response.json({ error: "The agent isn't running. The map still works." }, { status: 503 });
  }
  const upstreamBody = upstream.body;
  if (!upstream.ok || !upstreamBody) {
    return Response.json({ error: "The agent isn't running. The map still works." }, { status: 503 });
  }

  const encoder = new TextEncoder();
  const paths: string[] = [];
  const seenTools = new Set<string>();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        await relay(upstreamBody, send, paths, seenTools);
        await recordInquiry(orgId, analysis.id, question, paths, threadId).catch((error: unknown) => {
          const messageText = error instanceof Error ? error.message : "the inquiry was not stored";
          console.error(`inquiry was not stored: ${messageText}`);
        });
        send("done", { threadId });
      } catch (error) {
        const messageText = error instanceof Error ? error.message : "The agent stopped.";
        send("error", { error: messageText });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
  });
}

function agentHeaders(userId: string): Headers {
  const headers = new Headers({ "content-type": "application/json" });
  const secret = process.env.MDA_INGRESS_SECRET?.trim();
  if (secret) headers.set("x-mda-ingress-secret", secret);
  headers.set("x-mda-user-id", userId);
  return headers;
}

async function createThread(headers: Headers): Promise<string> {
  const response = await fetch(`${AGENT_URL}/threads`, { method: "POST", headers, body: "{}", signal: AbortSignal.timeout(4_000) });
  if (!response.ok) throw new Error("thread");
  const body: unknown = await response.json();
  const threadId = body !== null && typeof body === "object" ? Reflect.get(body, "thread_id") : undefined;
  if (typeof threadId !== "string" || !threadId) throw new Error("thread");
  return threadId;
}

async function relay(
  body: ReadableStream<Uint8Array>,
  send: (event: string, data: unknown) => void,
  paths: string[],
  seenTools: Set<string>,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) handleBlock(block, send, paths, seenTools);
  }
}

function handleBlock(
  block: string,
  send: (event: string, data: unknown) => void,
  paths: string[],
  seenTools: Set<string>,
): void {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice("event:".length).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice("data:".length).trim());
  }
  if (dataLines.length === 0) return;
  let data: unknown;
  try {
    data = JSON.parse(dataLines.join("\n"));
  } catch {
    return;
  }
  if (event === "updates") {
    for (const message of messagesIn(data)) noteMessage(message, send, paths, seenTools, false);
  } else if (event === "messages") {
    const message = Array.isArray(data) ? data[0] : data;
    noteMessage(message, send, paths, seenTools, true);
  }
}

function messagesIn(data: unknown): unknown[] {
  if (data === null || typeof data !== "object") return [];
  const out: unknown[] = [];
  for (const value of Object.values(data)) {
    if (value === null || typeof value !== "object" || !("messages" in value)) continue;
    const messages = Reflect.get(value, "messages");
    if (Array.isArray(messages)) out.push(...messages);
  }
  return out;
}

function noteMessage(
  message: unknown,
  send: (event: string, data: unknown) => void,
  paths: string[],
  seenTools: Set<string>,
  tokens: boolean,
): void {
  if (message === null || typeof message !== "object") return;
  const fields = messageFields(message);
  const kind = messageKind(message, fields);
  if (kind === "tool") {
    const name = stringOf(fields, "name") ?? "tool";
    const content = contentText(Reflect.get(fields, "content"));
    const returned = pathsIn(content);
    for (const path of returned) paths.push(path);
    send("paths", { name, paths: returned });
    return;
  }
  if (kind !== "ai") return;
  const calls = toolCalls(fields);
  for (const call of calls) {
    if (seenTools.has(call.id)) continue;
    seenTools.add(call.id);
    send("tool", { name: call.name, input: call.input });
  }
  if (!tokens || calls.length > 0) return;
  const text = contentText(Reflect.get(fields, "content"));
  if (text) send("text", { text });
}

function messageFields(message: object): object {
  const kwargs = Reflect.get(message, "kwargs");
  return kwargs !== null && typeof kwargs === "object" ? kwargs : message;
}

function messageKind(message: object, fields: object): "ai" | "tool" | "other" {
  const id = Reflect.get(message, "id");
  if (Array.isArray(id)) {
    const names = id.filter((part): part is string => typeof part === "string").join(" ");
    if (names.includes("ToolMessage")) return "tool";
    if (names.includes("AIMessage")) return "ai";
  }
  const type = stringOf(fields, "type") ?? stringOf(message, "type") ?? stringOf(fields, "role") ?? "";
  const normalized = type.toLowerCase();
  if (normalized.includes("tool")) return "tool";
  if (normalized === "ai" || normalized.includes("aimessage") || normalized === "assistant") return "ai";
  return "other";
}

function toolCalls(message: object): { id: string; name: string; input: string }[] {
  const raw = Reflect.get(message, "tool_calls");
  if (!Array.isArray(raw)) return [];
  const calls: { id: string; name: string; input: string }[] = [];
  for (const call of raw) {
    if (call === null || typeof call !== "object") continue;
    const name = stringOf(call, "name");
    if (!name) continue;
    const id = stringOf(call, "id") ?? name;
    const args = Reflect.get(call, "args");
    calls.push({ id, name, input: argsPreview(args) });
  }
  return calls;
}

function argsPreview(args: unknown): string {
  if (args === null || typeof args !== "object") return "";
  const path = stringOf(args, "path");
  const part = stringOf(args, "part");
  const role = stringOf(args, "role");
  const direction = stringOf(args, "direction");
  const to = stringOf(args, "to");
  return [part, role, path, direction, to].filter((entry): entry is string => Boolean(entry)).join(" ");
}

function pathsIn(content: string): string[] {
  try {
    const parsed: unknown = JSON.parse(content);
    if (parsed === null || typeof parsed !== "object") return [];
    const paths = Reflect.get(parsed, "paths");
    if (!Array.isArray(paths)) return [];
    return paths.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => (block !== null && typeof block === "object" ? stringOf(block, "text") ?? "" : ""))
    .join("");
}

function stringOf(value: object, key: string): string | null {
  const found = Reflect.get(value, key);
  return typeof found === "string" && found.trim() ? found : null;
}

function field(body: unknown, key: string): string | null {
  if (body === null || typeof body !== "object") return null;
  const value = Reflect.get(body, key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
