import { joinPlayer, toClient } from "@/lib/game";
import { handleError, json } from "@/lib/http";
import { mutateRoom } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { code } = await ctx.params;
    const body = (await request.json()) as { nickname?: string; selfieDataUrl?: string };
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
