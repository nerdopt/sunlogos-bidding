import { getSelfie, MAX_SELFIE_CHARS, replaceSelfie, toClient } from "@/lib/game";
import { handleError, header, json } from "@/lib/http";
import { clientAddress, rateLimit } from "@/lib/rate";
import { loadRoom, mutateRoom } from "@/lib/store";
import { GameError } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { code } = await ctx.params;
    const playerToken = header(request, "x-player-token");
    if (!playerToken) throw new GameError("Join this room first", 401);
    const room = await loadRoom(code);
    if (!room) throw new GameError("Room not found", 404);
    const player = room.players.find((p) => p.token === playerToken && !p.kicked);
    if (!player) throw new GameError("You are not in this room", 401);
    const selfieDataUrl = getSelfie(room, player.id);
    if (!selfieDataUrl) throw new GameError("Selfie not found", 404);
    return json({ playerId: player.id, selfieDataUrl });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    rateLimit(`join:${clientAddress(request)}`, 80, 10 * 60 * 1000);
    const { code } = await ctx.params;
    const playerToken = header(request, "x-player-token");
    if (!playerToken) throw new GameError("Join this room first", 401);
    const body = (await request.json()) as { selfieDataUrl?: string };
    if ((body.selfieDataUrl ?? "").length > MAX_SELFIE_CHARS) {
      throw new GameError("Selfie is too large — try a closer, smaller photo");
    }
    const room = await mutateRoom(code, (current) => replaceSelfie(current, playerToken, body.selfieDataUrl ?? ""));
    return json(toClient(room, { playerToken }));
  } catch (error) {
    return handleError(error);
  }
}
