import { json, handleError } from "@/lib/http";
import { clientAddress, rateLimit } from "@/lib/rate";
import { insertRoom, pruneOldRooms } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    rateLimit(`create:${clientAddress(request)}`, 10, 60 * 60 * 1000);
    rateLimit("create:global", 30, 10 * 60 * 1000);
    await pruneOldRooms().catch(() => undefined);
    const room = await insertRoom();
    return json({ code: room.code, hostToken: room.hostToken });
  } catch (error) {
    return handleError(error);
  }
}
