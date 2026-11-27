import { getSelfie } from "@/lib/game";
import { handleError, header, json } from "@/lib/http";
import { loadRoom, readSelfie } from "@/lib/store";
import { GameError } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ code: string; playerId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { code, playerId } = await ctx.params;
    const room = await loadRoom(code);
    if (!room) throw new GameError("Room not found", 404);
    const hostToken = header(request, "x-host-token");
    if (!hostToken || hostToken !== room.hostToken) {
      throw new GameError("Photos stay on the host screen", 401);
    }
    const selfieDataUrl = await readSelfie(code, playerId, getSelfie(room, playerId));
    if (!selfieDataUrl) throw new GameError("Selfie not found", 404);
    return json({ playerId, selfieDataUrl });
  } catch (error) {
    return handleError(error);
  }
}
