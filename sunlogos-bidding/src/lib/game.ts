import { id, roomCode, token } from "./ids";
import {
  GameError,
  type ClientRoom,
  type HighBid,
  type Item,
  type Player,
  type Room,
  type SealedEntry,
} from "./types";

export const SEALED_MS = 20_000;
export const TIEBREAK_MS = 15_000;
export const MAX_PLAYERS = 40;
export const MAX_ITEMS = 30;
export const MAX_SELFIE_CHARS = 280_000;
export const MAX_NICKNAME = 20;

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Keep lot text as NFC Unicode and drop NUL, which Postgres jsonb rejects. */
function cleanText(value: string): string {
  return value.replace(/\u0000/g, "").trim().normalize("NFC");
}

function activePlayers(room: Room): Player[] {
  return room.players.filter((p) => !p.kicked);
}

function playerById(room: Room, playerId: string): Player {
  const player = room.players.find((p) => p.id === playerId && !p.kicked);
  if (!player) throw new GameError("Player not found", 404);
  return player;
}

function currentItem(room: Room): Item | null {
  if (room.currentItemIndex < 0 || room.currentItemIndex >= room.items.length) return null;
  return room.items[room.currentItemIndex] ?? null;
}

function nicknameOf(room: Room, playerId: string): string {
  return room.players.find((p) => p.id === playerId)?.nickname ?? "Unknown";
}

function resetRound(room: Room) {
  room.sealedBids = {};
  room.eligibleIds = [];
  room.currentHigh = null;
  room.tiedIds = [];
  room.tieFloor = 0;
  room.sealedEndsAt = null;
  room.lastAward = null;
}

export function createRoom(now = Date.now()): Room {
  return {
    code: roomCode(),
    hostToken: token(),
    startingMoney: 1000,
    sealedDurationMs: SEALED_MS,
    tiebreakDurationMs: TIEBREAK_MS,
    items: [],
    players: [],
    phase: "lobby",
    sessionStarted: false,
    currentItemIndex: -1,
    sealedEndsAt: null,
    version: 0,
    createdAt: now,
    sealedBids: {},
    eligibleIds: [],
    currentHigh: null,
    tiedIds: [],
    tieFloor: 0,
    lastAward: null,
  };
}

export function setStartingMoney(room: Room, amount: number): Room {
  const next = clone(room);
  if (next.sessionStarted) throw new GameError("Starting money is locked after the evening begins");
  if (!Number.isInteger(amount) || amount < 1 || amount > 1_000_000) {
    throw new GameError("Starting money must be a whole number from 1 to 1,000,000");
  }
  next.startingMoney = amount;
  return next;
}

export function addItem(room: Room, name: string, notes = ""): Room {
  const next = clone(room);
  if (next.sessionStarted) throw new GameError("Lots are locked after the evening begins");
  if (next.items.length >= MAX_ITEMS) throw new GameError("Too many lots");
  const trimmed = cleanText(name);
  if (trimmed.length < 1 || trimmed.length > 80) throw new GameError("Give the lot a name (1–80 characters)");
  const cleanNotes = cleanText(notes);
  if (cleanNotes.length > 240) throw new GameError("Notes are too long");
  next.items.push({ id: id("lot"), name: trimmed, notes: cleanNotes });
  return next;
}

export function removeItem(room: Room, itemId: string): Room {
  const next = clone(room);
  if (next.sessionStarted) throw new GameError("Lots are locked after the evening begins");
  next.items = next.items.filter((item) => item.id !== itemId);
  return next;
}

export function reorderItems(room: Room, itemIds: string[]): Room {
  const next = clone(room);
  if (next.sessionStarted) throw new GameError("Lots are locked after the evening begins");
  if (itemIds.length !== next.items.length) throw new GameError("Invalid lot order");
  const map = new Map(next.items.map((item) => [item.id, item]));
  const ordered: Item[] = [];
  for (const itemId of itemIds) {
    const item = map.get(itemId);
    if (!item) throw new GameError("Unknown lot");
    ordered.push(item);
  }
  next.items = ordered;
  return next;
}

function assertSelfie(selfieDataUrl: string) {
  if (
    !selfieDataUrl.startsWith("data:image/jpeg;base64,") &&
    !selfieDataUrl.startsWith("data:image/png;base64,")
  ) {
    throw new GameError("Selfie must be a JPEG or PNG image");
  }
  if (selfieDataUrl.length > MAX_SELFIE_CHARS) {
    throw new GameError("Selfie is too large — try a closer, smaller photo");
  }
}

export function joinPlayer(room: Room, nickname: string, selfieDataUrl: string, now = Date.now()): { room: Room; player: Player } {
  const next = clone(tick(room, now));
  if (next.sessionStarted || next.phase !== "lobby") {
    throw new GameError("This room is no longer accepting players");
  }
  const nick = nickname.trim().replace(/\s+/g, " ");
  if (nick.length < 2 || nick.length > MAX_NICKNAME) {
    throw new GameError("Nickname must be 2–20 characters");
  }
  if (activePlayers(next).some((p) => p.nickname.toLowerCase() === nick.toLowerCase())) {
    throw new GameError("That nickname is taken in this room");
  }
  if (activePlayers(next).length >= MAX_PLAYERS) {
    throw new GameError(`This room is limited to ${MAX_PLAYERS} participants`);
  }
  assertSelfie(selfieDataUrl);
  const player: Player = {
    id: id("p"),
    token: token(),
    nickname: nick,
    selfieDataUrl,
    photoVersion: 1,
    balance: 0,
    storage: [],
    kicked: false,
  };
  next.players.push(player);
  return { room: next, player };
}

export function kickPlayer(room: Room, playerId: string): Room {
  const next = clone(room);
  const player = next.players.find((p) => p.id === playerId);
  if (!player) throw new GameError("Player not found", 404);
  player.kicked = true;
  if (next.currentHigh?.playerId === playerId) {
    next.currentHigh = null;
  }
  next.tiedIds = next.tiedIds.filter((id) => id !== playerId);
  delete next.sealedBids[playerId];
  next.eligibleIds = next.eligibleIds.filter((id) => id !== playerId);
  return next;
}

function beginSealed(room: Room) {
  room.phase = "sealed";
  room.sealedBids = {};
  room.tiedIds = [];
  room.tieFloor = 0;
  room.currentHigh = null;
  room.lastAward = null;
  room.sealedEndsAt = null;
}

export function startEvening(room: Room, now = Date.now()): Room {
  const next = clone(tick(room, now));
  if (next.sessionStarted) throw new GameError("The evening has already begun");
  if (next.items.length < 1) throw new GameError("Add at least one lot");
  if (activePlayers(next).length < 1) throw new GameError("Wait for at least one player");
  next.sessionStarted = true;
  for (const player of next.players) {
    if (!player.kicked) player.balance = next.startingMoney;
  }
  next.currentItemIndex = 0;
  beginSealed(next);
  return next;
}

export function startCountdown(room: Room, now = Date.now()): Room {
  const next = clone(tick(room, now));
  if (next.phase !== "sealed") throw new GameError("Bring a lot up before starting the countdown");
  if (next.sealedEndsAt !== null) throw new GameError("The countdown is already running");
  next.sealedEndsAt = now + next.sealedDurationMs;
  return next;
}

export function startNextLot(room: Room, now = Date.now()): Room {
  const next = clone(tick(room, now));
  if (!next.sessionStarted) throw new GameError("Start the evening first");
  if (next.phase !== "awarded" && next.phase !== "lobby") {
    throw new GameError("Finish the current lot first");
  }
  const nextIndex = next.currentItemIndex + 1;
  if (nextIndex >= next.items.length) {
    next.phase = "ended";
    next.sealedEndsAt = null;
    return next;
  }
  next.currentItemIndex = nextIndex;
  resetRound(next);
  beginSealed(next);
  return next;
}

export function endSession(room: Room): Room {
  const next = clone(room);
  next.phase = "ended";
  next.sealedEndsAt = null;
  return next;
}

function requireBidAmount(amount: number, balance: number, minExclusive = 0) {
  if (!Number.isInteger(amount)) throw new GameError("Bids must be whole numbers");
  if (amount < 1) throw new GameError("Bid at least 1");
  if (amount > balance) throw new GameError("You cannot bid more than your balance");
  if (amount <= minExclusive) throw new GameError(`Bid higher than ${minExclusive}`);
}

export function submitSealedBid(room: Room, playerId: string, amount: number, pass: boolean, now = Date.now()): Room {
  const next = clone(tick(room, now));
  if (next.phase !== "sealed" && next.phase !== "tiebreak") {
    throw new GameError("Sealed bidding is not open");
  }
  if (next.sealedEndsAt === null) throw new GameError("Wait for the host to start the countdown");
  if (now >= next.sealedEndsAt) {
    throw new GameError("That bidding window just closed");
  }
  const player = playerById(next, playerId);
  if (next.phase === "tiebreak" && !next.tiedIds.includes(playerId)) {
    throw new GameError("Only tied leaders may re-bid");
  }
  if (pass) {
    if (next.phase === "tiebreak") throw new GameError("Tied leaders must bid higher or wait for the host");
    next.sealedBids[playerId] = { amount: 0, pass: true, at: now };
    return next;
  }
  const floor = next.phase === "tiebreak" ? next.tieFloor : 0;
  requireBidAmount(amount, player.balance, floor);
  next.sealedBids[playerId] = { amount, pass: false, at: now };
  return next;
}

export function raiseBid(room: Room, playerId: string, amount: number, now = Date.now()): Room {
  const next = clone(tick(room, now));
  if (next.phase !== "open") throw new GameError("Open bidding is not active");
  const player = playerById(next, playerId);
  if (!next.eligibleIds.includes(playerId)) {
    throw new GameError("Only players who bid in the sealed round can raise");
  }
  const floor = next.currentHigh?.amount ?? 0;
  requireBidAmount(amount, player.balance, floor);
  next.currentHigh = { playerId, amount };
  return next;
}

function entriesForWindow(room: Room, ids: string[]): { playerId: string; order: number; entry: SealedEntry }[] {
  return ids
    .map((playerId, order) => ({ playerId, order, entry: room.sealedBids[playerId] }))
    .filter((row): row is { playerId: string; order: number; entry: SealedEntry } => Boolean(row.entry));
}

function highestNonPass(
  rows: { playerId: string; order: number; entry: SealedEntry }[],
): { amount: number; leaders: string[] } | null {
  const live = rows.filter((row) => !row.entry.pass);
  if (live.length === 0) return null;
  let amount = 0;
  for (const row of live) amount = Math.max(amount, row.entry.amount);
  const leaders = live
    .filter((row) => row.entry.amount === amount)
    .sort((a, b) => {
      const ta = a.entry.at ?? a.order;
      const tb = b.entry.at ?? b.order;
      if (ta !== tb) return ta - tb;
      return a.order - b.order;
    })
    .map((row) => row.playerId);
  return { amount, leaders };
}

function goOpen(room: Room, high: HighBid) {
  room.phase = "open";
  room.currentHigh = high;
  room.tiedIds = [];
  room.sealedEndsAt = null;
}

function startTiebreak(room: Room, leaders: string[], floor: number, now: number) {
  room.phase = "tiebreak";
  room.tiedIds = leaders;
  room.tieFloor = floor;
  room.currentHigh = null;
  for (const playerId of leaders) delete room.sealedBids[playerId];
  room.sealedEndsAt = now + room.tiebreakDurationMs;
}

function resolveSealed(room: Room, now: number) {
  const ids = activePlayers(room).map((p) => p.id);
  const rows = entriesForWindow(room, ids);
  const result = highestNonPass(rows);
  room.eligibleIds = rows.filter((row) => !row.entry.pass).map((row) => row.playerId);
  if (!result) {
    const item = currentItem(room);
    room.phase = "awarded";
    room.sealedEndsAt = null;
    room.currentHigh = null;
    room.lastAward = item
      ? {
          playerId: "",
          nickname: "",
          itemId: item.id,
          itemName: item.name,
          amount: 0,
          sold: false,
        }
      : null;
    return;
  }
  if (result.leaders.length === 1) {
    goOpen(room, { playerId: result.leaders[0], amount: result.amount });
    return;
  }
  startTiebreak(room, result.leaders, result.amount, now);
}

function awardSold(room: Room, high: HighBid) {
  const item = currentItem(room);
  if (!item) throw new GameError("No lot is up");
  const winner = playerById(room, high.playerId);
  if (high.amount > winner.balance) throw new GameError("Winner cannot cover this bid");
  winner.balance -= high.amount;
  winner.storage.push({ itemId: item.id, itemName: item.name, amount: high.amount });
  room.lastAward = {
    playerId: winner.id,
    nickname: winner.nickname,
    itemId: item.id,
    itemName: item.name,
    amount: high.amount,
    sold: true,
  };
  room.currentHigh = high;
  room.phase = "awarded";
  room.sealedEndsAt = null;
  room.tiedIds = [];
}

function resolveTiebreak(room: Room, now: number) {
  const rows = entriesForWindow(room, room.tiedIds);
  const result = highestNonPass(rows);
  if (!result) {
    const winnerId = room.tiedIds[0];
    if (!winnerId) {
      room.phase = "awarded";
      room.sealedEndsAt = null;
      return;
    }
    awardSold(room, { playerId: winnerId, amount: room.tieFloor });
    return;
  }
  if (result.leaders.length === 1) {
    const winnerId = result.leaders[0];
    if (!room.eligibleIds.includes(winnerId)) room.eligibleIds.push(winnerId);
    goOpen(room, { playerId: winnerId, amount: result.amount });
    return;
  }
  startTiebreak(room, result.leaders, result.amount, now);
}

export function tick(room: Room, now = Date.now()): Room {
  const next = clone(room);
  if (
    (next.phase === "sealed" || next.phase === "tiebreak") &&
    next.sealedEndsAt !== null &&
    now >= next.sealedEndsAt
  ) {
    if (next.phase === "sealed") resolveSealed(next, now);
    else resolveTiebreak(next, now);
  }
  return next;
}

export function breakTie(room: Room, playerId: string, now = Date.now()): Room {
  const next = clone(tick(room, now));
  if (next.phase !== "tiebreak") throw new GameError("No tie to break");
  if (!next.tiedIds.includes(playerId)) throw new GameError("That player is not tied");
  playerById(next, playerId);
  const amount = next.sealedBids[playerId]?.pass === false ? next.sealedBids[playerId].amount : next.tieFloor;
  if (!next.eligibleIds.includes(playerId)) next.eligibleIds.push(playerId);
  goOpen(next, { playerId, amount: Math.max(amount, 1) });
  return next;
}

export function awardWinner(room: Room, now = Date.now()): Room {
  const next = clone(tick(room, now));
  if (next.phase !== "open" && next.phase !== "tiebreak") {
    throw new GameError("Nothing to award yet");
  }
  if (next.phase === "tiebreak") {
    throw new GameError("Break the tie first, or wait for a unique high bid");
  }
  const item = currentItem(next);
  if (!item) throw new GameError("No lot is up");
  const high = next.currentHigh;
  if (!high) {
    next.phase = "awarded";
    next.lastAward = {
      playerId: "",
      nickname: "",
      itemId: item.id,
      itemName: item.name,
      amount: 0,
      sold: false,
    };
    next.sealedEndsAt = null;
    return next;
  }
  awardSold(next, high);
  return next;
}

export function replaceSelfie(room: Room, playerToken: string, selfieDataUrl: string): Room {
  const next = clone(room);
  if (next.sessionStarted) throw new GameError("Photos are locked once the evening starts");
  const player = next.players.find((p) => p.token === playerToken && !p.kicked);
  if (!player) throw new GameError("You are not in this room", 401);
  assertSelfie(selfieDataUrl);
  player.selfieDataUrl = selfieDataUrl;
  player.photoVersion = (player.photoVersion ?? 1) + 1;
  return next;
}

export function getSelfie(room: Room, playerId: string): string | null {
  const player = room.players.find((p) => p.id === playerId && !p.kicked);
  return player?.selfieDataUrl ?? null;
}

export function toClient(room: Room, opts: { hostToken?: string; playerToken?: string; now?: number }): ClientRoom {
  const now = opts.now ?? Date.now();
  const live = tick(room, now);
  const isHost = Boolean(opts.hostToken && opts.hostToken === live.hostToken);
  const youPlayer = opts.playerToken ? live.players.find((p) => p.token === opts.playerToken && !p.kicked) : undefined;
  const item = currentItem(live);
  const players = activePlayers(live).map((p) => ({
    id: p.id,
    nickname: p.nickname,
    balance: live.sessionStarted ? p.balance : live.startingMoney,
    storage: isHost || youPlayer?.id === p.id ? p.storage : [],
    kicked: p.kicked,
    photoVersion: p.photoVersion ?? 1,
  }));

  const submittedIds = Object.keys(live.sealedBids);
  const high = live.currentHigh
    ? {
        playerId: live.currentHigh.playerId,
        nickname: nicknameOf(live, live.currentHigh.playerId),
        amount: live.currentHigh.amount,
      }
    : null;

  const tiedLeaders =
    live.phase === "tiebreak"
      ? live.tiedIds.map((playerId) => ({
          playerId,
          nickname: nicknameOf(live, playerId),
          amount: live.tieFloor,
        }))
      : high
        ? [high]
        : [];

  const youBid = youPlayer ? live.sealedBids[youPlayer.id] : undefined;
  const minRaise = (live.currentHigh?.amount ?? 0) + 1;
  const canBid =
    Boolean(youPlayer) &&
    ((live.phase === "sealed" && live.sealedEndsAt !== null && now < live.sealedEndsAt) ||
      (live.phase === "tiebreak" &&
        youPlayer !== undefined &&
        live.tiedIds.includes(youPlayer.id) &&
        live.sealedEndsAt !== null &&
        now < live.sealedEndsAt));
  const canRaise =
    Boolean(youPlayer) && live.phase === "open" && live.eligibleIds.includes(youPlayer!.id);

  return {
    code: live.code,
    phase: live.phase,
    startingMoney: live.startingMoney,
    items: live.items,
    players,
    currentItemIndex: live.currentItemIndex,
    currentItem: item,
    sealedEndsAt: live.sealedEndsAt,
    serverNow: now,
    submittedCount: submittedIds.length,
    playerCount: activePlayers(live).length,
    eligibleCount: live.eligibleIds.length,
    currentHigh: live.phase === "sealed" ? null : high,
    tiedLeaders: live.phase === "sealed" ? [] : tiedLeaders,
    lastAward: live.lastAward,
    sessionStarted: live.sessionStarted,
    remainingLots: Math.max(0, live.items.length - Math.max(0, live.currentItemIndex + (live.phase === "awarded" || live.phase === "ended" ? 1 : 0))),
    isHost,
    version: live.version,
    you: youPlayer
      ? {
          playerId: youPlayer.id,
          nickname: youPlayer.nickname,
          balance: live.sessionStarted ? youPlayer.balance : live.startingMoney,
          storage: youPlayer.storage,
          submitted: Boolean(youBid),
          passed: Boolean(youBid?.pass),
          yourBid: youBid && !youBid.pass ? youBid.amount : null,
          canBid,
          canRaise,
          canPass: canBid && live.phase === "sealed",
          youAreTied: live.phase === "tiebreak" && live.tiedIds.includes(youPlayer.id),
          youAreHigh: live.currentHigh?.playerId === youPlayer.id,
          minRaise,
        }
      : null,
  };
}
