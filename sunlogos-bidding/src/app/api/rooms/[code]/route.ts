import {
  addItem,
  awardWinner,
  breakTie,
  endSession,
  kickPlayer,
  removeItem,
  reorderItems,
  setStartingMoney,
  startCountdown,
  startEvening,
  startNextLot,
  toClient,
} from "@/lib/game";
import { handleError, header, json } from "@/lib/http";
import { loadAndTick, mutateRoom } from "@/lib/store";
import { GameError, type Room } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ code: string }> };

function requireHost(room: Room, hostToken: string | undefined) {
  if (!hostToken || hostToken !== room.hostToken) {
    throw new GameError("Host sign-in missing", 403);
  }
}

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { code } = await ctx.params;
    const room = await loadAndTick(code);
    const view = toClient(room, {
      hostToken: header(request, "x-host-token"),
      playerToken: header(request, "x-player-token"),
    });
    return json(view);
  } catch (error) {
    return handleError(error);
  }
}

type HostAction =
  | { type: "setStartingMoney"; amount: number }
  | { type: "addItem"; name: string; notes?: string }
  | { type: "removeItem"; itemId: string }
  | { type: "reorderItems"; itemIds: string[] }
  | { type: "kickPlayer"; playerId: string }
  | { type: "startEvening" }
  | { type: "startCountdown" }
  | { type: "startNextLot" }
  | { type: "awardWinner" }
  | { type: "breakTie"; playerId: string }
  | { type: "endSession" };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { code } = await ctx.params;
    const hostToken = header(request, "x-host-token");
    const action = (await request.json()) as HostAction;
    const room = await mutateRoom(code, (current) => {
      requireHost(current, hostToken);
      switch (action.type) {
        case "setStartingMoney":
          return setStartingMoney(current, action.amount);
        case "addItem":
          return addItem(current, action.name, action.notes ?? "");
        case "removeItem":
          return removeItem(current, action.itemId);
        case "reorderItems":
          return reorderItems(current, action.itemIds);
        case "kickPlayer":
          return kickPlayer(current, action.playerId);
        case "startEvening":
          return startEvening(current);
        case "startCountdown":
          return startCountdown(current);
        case "startNextLot":
          return startNextLot(current);
        case "awardWinner":
          return awardWinner(current);
        case "breakTie":
          return breakTie(current, action.playerId);
        case "endSession":
          return endSession(current);
        default:
          throw new GameError("Unknown action");
      }
    });
    return json(
      toClient(room, {
        hostToken,
        playerToken: header(request, "x-player-token"),
      }),
    );
  } catch (error) {
    return handleError(error);
  }
}
