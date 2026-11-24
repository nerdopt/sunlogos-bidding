import { toClient } from "@/lib/game";
import { handleError, header } from "@/lib/http";
import { loadAndTick } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { code } = await ctx.params;
    const hostToken = header(request, "x-host-token");
    const playerToken = header(request, "x-player-token");
    const encoder = new TextEncoder();
    let last = "";
    let closed = false;

    const stream = new ReadableStream({
      start(controller) {
        const send = async () => {
          if (closed) return;
          try {
            const room = await loadAndTick(code);
            const view = toClient(room, { hostToken, playerToken });
            const payload = JSON.stringify(view);
            if (payload !== last) {
              last = payload;
              controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
            } else {
              controller.enqueue(encoder.encode(`: ping\n\n`));
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : "error";
            controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`));
          }
        };
        void send();
        const interval = setInterval(() => void send(), 400);
        const timeout = setTimeout(() => {
          closed = true;
          clearInterval(interval);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }, 25_000);
        request.signal.addEventListener("abort", () => {
          closed = true;
          clearInterval(interval);
          clearTimeout(timeout);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        });
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
