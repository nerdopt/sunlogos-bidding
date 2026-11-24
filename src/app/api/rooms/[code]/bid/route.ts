import { raiseBid, submitSealedBid, toClient } from "@/lib/game";
import { handleError, header, json } from "@/lib/http";
import { mutateRoom } from "@/lib/store";
import { GameError } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { code } = await ctx.params;
    const playerToken = header(request, "x-player-token");
    if (!playerToken) throw new GameError("Join this room first", 401);
    const body = (await request.json()) as { amount?: number; pass?: boolean; raise?: boolean };
    const room = await mutateRoom(code, (current) => {
      const player = current.players.find((p) => p.token === playerToken && !p.kicked);
      if (!player) throw new GameError("You are not in this room", 401);
      if (body.raise) return raiseBid(current, player.id, Number(body.amount));
      return submitSealedBid(current, player.id, Number(body.amount ?? 0), Boolean(body.pass));
    });
    return json(toClient(room, { playerToken }));
  } catch (error) {
    return handleError(error);
  }
}
