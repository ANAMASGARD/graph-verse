import { auth } from "@clerk/nextjs/server";

import { readProgress } from "@/lib/graph/analysis-store";
import type { ProgressEvent } from "@/lib/graph/analysis-types";
import { subscribeProgress } from "@/lib/progress/channel";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { orgId } = await auth();
  if (!orgId) {
    return new Response("Sign in required.", { status: 401 });
  }

  const { id } = await context.params;
  const current = await readProgress(orgId, id);
  if (!current) {
    return new Response("Analysis not found.", { status: 404 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => Promise<void>) | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ProgressEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const finish = async () => {
        if (closed) return;
        closed = true;
        if (unsubscribe) await unsubscribe().catch(() => undefined);
        try {
          controller.close();
        } catch {
          // The client already hung up.
        }
      };

      const pending: ProgressEvent[] = [];
      let ready = false;
      unsubscribe = await subscribeProgress(id, (event) => {
        if (!ready) {
          pending.push(event);
          return;
        }
        send(event);
        if (event.status === "complete" || event.status === "failed") void finish();
      });
      const latest = (await readProgress(orgId, id)) ?? current;
      send(latest);
      ready = true;
      for (const event of pending) {
        send(event);
        if (event.status === "complete" || event.status === "failed") {
          await finish();
          return;
        }
      }
      if (latest.status === "complete" || latest.status === "failed") {
        await finish();
        return;
      }
      request.signal.addEventListener("abort", () => {
        void finish();
      });
    },
    cancel() {
      closed = true;
      if (unsubscribe) void unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}
