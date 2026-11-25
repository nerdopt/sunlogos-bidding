import { joinPlayer, MAX_SELFIE_CHARS, toClient } from "@/lib/game";
import { handleError, json } from "@/lib/http";
import { clientAddress, rateLimit } from "@/lib/rate";
import { mutateRoom } from "@/lib/store";
import { GameError } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    rateLimit(`join:${clientAddress(request)}`, 80, 10 * 60 * 1000);
    const { code } = await ctx.params;
    const body = (await request.json()) as { nickname?: string; selfieDataUrl?: string };
    if ((body.selfieDataUrl ?? "").length > MAX_SELFIE_CHARS) {
      throw new GameError("Selfie is too large — try a closer, smaller photo");
    }
    let playerId = "";
    let playerToken = "";
    const room = await mutateRoom(code, (current) => {
      const joined = joinPlayer(current, body.nickname ?? "", body.selfieDataUrl ?? "");
      playerId = joined.player.id;
      playerToken = joined.player.token;
      return joined.room;
    });
    return json({
      playerId,
      playerToken,
      room: toClient(room, { playerToken }),
    });
  } catch (error) {
    return handleError(error);
  }
}
