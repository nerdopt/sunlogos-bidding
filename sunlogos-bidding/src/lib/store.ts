import { createRoom, tick } from "./game";
import { sql } from "./db";
import { GameError, type Room } from "./types";

type RoomRow = {
  code: string;
  host_token: string;
  version: number;
  state: Room | string;
};

function parseState(row: RoomRow): Room {
  const state = typeof row.state === "string" ? (JSON.parse(row.state) as Room) : row.state;
  state.code = row.code;
  state.hostToken = row.host_token;
  state.version = row.version;
  return state;
}

export async function insertRoom(now = Date.now()): Promise<Room> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const room = createRoom(now);
    try {
      await sql(
        "insert into rooms (code, host_token, version, state, updated_at) values ($1, $2, $3, $4::jsonb, now())",
        [room.code, room.hostToken, room.version, JSON.stringify(room)],
      );
      return room;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("duplicate") || message.includes("unique")) continue;
      throw error;
    }
  }
  throw new GameError("Could not create a room", 500);
}

const LIGHT_ROOM_SQL = `select code, host_token, version,
  jsonb_set(
    state,
    '{players}',
    coalesce(
      (
        select jsonb_agg(player.elem - 'selfieDataUrl' order by player.ord)
        from jsonb_array_elements(state->'players') with ordinality as player(elem, ord)
      ),
      '[]'::jsonb
    )
  ) as state
from rooms where code = $1`;

export async function loadRoom(code: string): Promise<Room | null> {
  const rows = await sql<RoomRow>("select code, host_token, version, state from rooms where code = $1", [
    code.toUpperCase(),
  ]);
  if (!rows[0]) return null;
  return parseState(rows[0]);
}

/** Live reads skip selfie bytes so a poll does not wait on megabytes of photos. Never save this copy. */
async function loadRoomLight(code: string): Promise<Room | null> {
  const rows = await sql<RoomRow>(LIGHT_ROOM_SQL, [code.toUpperCase()]);
  if (!rows[0]) return null;
  return parseState(rows[0]);
}

async function saveIfVersion(room: Room, expectedVersion: number): Promise<boolean> {
  const rows = await sql<{ code: string }>(
    `update rooms
     set version = $1, state = $2::jsonb, host_token = $3, updated_at = now()
     where code = $4 and version = $5
     returning code`,
    [room.version, JSON.stringify(room), room.hostToken, room.code, expectedVersion],
  );
  return rows.length > 0;
}

export async function mutateRoom(code: string, fn: (room: Room) => Room, now = Date.now()): Promise<Room> {
  const key = code.toUpperCase();
  for (let i = 0; i < 6; i++) {
    const current = await loadRoom(key);
    if (!current) throw new GameError("Room not found", 404);
    const expected = current.version;
    const ticked = tick(current, now);
    const next = fn(ticked);
    next.version = expected + 1;
    next.code = key;
    const ok = await saveIfVersion(next, expected);
    if (ok) return next;
  }
  throw new GameError("Room is busy — try again", 409);
}

function playFingerprint(room: Room): string {
  const copy = { ...room, version: 0 };
  return JSON.stringify(copy);
}

export async function loadAndTick(code: string, now = Date.now()): Promise<Room> {
  const key = code.toUpperCase();
  const current = await loadRoomLight(key);
  if (!current) throw new GameError("Room not found", 404);
  const ticked = tick(current, now);
  if (playFingerprint(current) === playFingerprint(ticked)) return ticked;
  return mutateRoom(key, (room) => room, now);
}

export async function pruneOldRooms(): Promise<void> {
  const cutoff = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  await sql("delete from rooms where updated_at < $1::timestamptz", [cutoff]);
}
