import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const TTL_SECONDS = 10 * 60;

export type AgentCredential = { orgId: string; analysisId: string; exp: number };

export function mintCredential(orgId: string, analysisId: string, now = Date.now()): string {
  const payload: AgentCredential = {
    orgId,
    analysisId,
    exp: Math.floor(now / 1000) + TTL_SECONDS,
  };
  const body = encode(payload);
  return `${body}.${sign(body)}`;
}

export function readCredential(token: string, now = Date.now()): AgentCredential | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = sign(body);
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;
  const orgId = Reflect.get(parsed, "orgId");
  const analysisId = Reflect.get(parsed, "analysisId");
  const exp = Reflect.get(parsed, "exp");
  if (typeof orgId !== "string" || typeof analysisId !== "string" || typeof exp !== "number") return null;
  if (!orgId || !analysisId || exp * 1000 <= now) return null;
  return { orgId, analysisId, exp };
}

function encode(payload: AgentCredential): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function sign(body: string): string {
  const secret = process.env.GRAPH_VERSE_AGENT_SECRET?.trim();
  if (!secret) throw new Error("GRAPH_VERSE_AGENT_SECRET isn't set, so a graph credential cannot be signed.");
  return createHmac("sha256", secret).update(body).digest("base64url");
}
