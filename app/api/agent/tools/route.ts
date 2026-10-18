import { readCredential } from "@/lib/agent/credential";
import { runTool } from "@/lib/agent/queries";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  let credential: ReturnType<typeof readCredential> = null;
  try {
    credential = token ? readCredential(token) : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "The credential could not be checked.";
    return Response.json({ text: message, paths: [] }, { status: 503 });
  }
  if (!credential) return Response.json({ text: "The credential is missing or expired.", paths: [] }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ text: "The tool body was not JSON.", paths: [] }, { status: 400 });
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ text: "The tool body was not an object.", paths: [] }, { status: 400 });
  }
  const input: { [key: string]: unknown } = {};
  for (const key of Object.keys(body)) input[key] = Reflect.get(body, key);
  try {
    const result = await runTool(credential.orgId, credential.analysisId, input);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The query failed.";
    return Response.json({ text: message, paths: [] }, { status: 500 });
  }
}
