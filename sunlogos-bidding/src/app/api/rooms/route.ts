import { json, handleError } from "@/lib/http";
import { insertRoom, pruneOldRooms } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await pruneOldRooms().catch(() => undefined);
    const room = await insertRoom();
    return json({ code: room.code, hostToken: room.hostToken });
  } catch (error) {
    return handleError(error);
  }
}
