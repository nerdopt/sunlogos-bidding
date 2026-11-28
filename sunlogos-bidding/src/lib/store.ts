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

/** Photos live beside the room so a host save does not rewrite every selfie. */
async function storeSelfies(room: Room): Promise<void> {
  for (const player of room.players) {
    if (!player.selfieDataUrl) continue;
    await sql(
      `insert into room_selfies (code, player_id, data) values ($1, $2, $3)
       on conflict (code, player_id) do update set data = excluded.data`,
      [room.code, player.id, player.selfieDataUrl],
    );
  }
  const ids = room.players.map((player) => player.id);
  if (ids.length === 0) {
    await sql("delete from room_selfies where code = $1", [room.code]);
    return;
  }
  const placeholders = ids.map((_, index) => `$${index + 2}`).join(", ");
  await sql(`delete from room_selfies where code = $1 and player_id not in (${placeholders})`, [room.code, ...ids]);
}

function stateWithoutSelfies(room: Room): Room {
  return {
    ...room,
    players: room.players.map((player) => ({ ...player, selfieDataUrl: "" })),
  };
}

async function saveIfVersion(room: Room, expectedVersion: number): Promise<boolean> {
  await storeSelfies(room);
  const rows = await sql<{ code: string }>(
    `update rooms
     set version = $1, state = $2::jsonb, host_token = $3, updated_at = now()
     where code = $4 and version = $5
     returning code`,
    [room.version, JSON.stringify(stateWithoutSelfies(room)), room.hostToken, room.code, expectedVersion],
  );
  return rows.length > 0;
}

export async function readSelfie(code: string, playerId: string, embedded: string | null): Promise<string | null> {
  if (embedded) return embedded;
  const rows = await sql<{ data: string }>("select data from room_selfies where code = $1 and player_id = $2", [
    code.toUpperCase(),
    playerId,
  ]);
  return rows[0]?.data ?? null;
}

const roomQueue = new Map<string, Promise<unknown>>();

function enqueueRoom<T>(code: string, fn: () => Promise<T>): Promise<T> {
  const key = code.toUpperCase();
  const prev = roomQueue.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  roomQueue.set(key, settled);
  void settled.finally(() => {
    if (roomQueue.get(key) === settled) roomQueue.delete(key);
  });
  return run;
}

export async function mutateRoom(code: string, fn: (room: Room) => Room, now = Date.now()): Promise<Room> {
  const key = code.toUpperCase();
  return enqueueRoom(key, () => writeRoom(key, fn, now));
}

async function writeRoom(key: string, fn: (room: Room) => Room, now: number): Promise<Room> {
  for (let i = 0; i < 6; i++) {
    const current = await loadRoom(key);
    if (!current) throw new GameError("Room not found", 404);
    const expected = current.version;
    const ticked = tick(current, now);
    const next = fn(ticked);
    next.version = expected + 1;
    next.code = key;
    const ok = await saveIfVersion(next, expected);
    if (ok) {
      try {
        rememberLive(next);
      } catch {
        /* the row is already saved */
      }
      return next;
    }
  }
  throw new GameError("Room is busy — try again", 409);
}

const LIVE_MS = 300;

type LiveSnap = { room: Room; version: number; expires: number };

const liveSnaps = new Map<string, LiveSnap>();
const liveInflight = new Map<string, Promise<Room>>();

function rememberLive(room: Room, now = Date.now()) {
  const light = JSON.parse(JSON.stringify(stateWithoutSelfies(room))) as Room;
  const key = light.code.toUpperCase();
  const prev = liveSnaps.get(key);
  if (prev && prev.version > light.version) return;
  liveSnaps.set(key, { room: light, version: light.version, expires: now + LIVE_MS });
}

function timerDue(room: Room, now: number) {
  return (
    (room.phase === "sealed" || room.phase === "tiebreak") &&
    room.sealedEndsAt !== null &&
    now >= room.sealedEndsAt
  );
}

function playFingerprint(room: Room): string {
  const copy = { ...room, version: 0 };
  return JSON.stringify(copy);
}

async function refreshLive(key: string, now: number): Promise<Room> {
  const current = await loadRoomLight(key);
  if (!current) throw new GameError("Room not found", 404);
  const ticked = tick(current, now);
  let room = ticked;
  if (playFingerprint(current) !== playFingerprint(ticked)) {
    room = await mutateRoom(key, (loaded) => loaded, now);
  }
  const newest = liveSnaps.get(key);
  if (newest && newest.version > room.version) return newest.room;
  rememberLive(room, now);
  return room;
}

/** One shared read per room, so forty phones do not each take a database connection. */
export async function loadAndTick(code: string, now = Date.now()): Promise<Room> {
  const key = code.toUpperCase();
  const cached = liveSnaps.get(key);
  if (cached && cached.expires > now && !timerDue(cached.room, now)) return cached.room;
  const pending = liveInflight.get(key);
  if (pending) return pending;
  const run = refreshLive(key, now).finally(() => {
    if (liveInflight.get(key) === run) liveInflight.delete(key);
  });
  liveInflight.set(key, run);
  return run;
}

export async function pruneOldRooms(): Promise<void> {
  const cutoff = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  await sql("delete from rooms where updated_at < $1::timestamptz", [cutoff]);
}
