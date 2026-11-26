import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addItem,
  awardWinner,
  breakTie,
  createRoom,
  joinPlayer,
  MAX_PLAYERS,
  raiseBid,
  setStartingMoney,
  startEvening,
  startNextLot,
  submitSealedBid,
  tick,
  toClient,
} from "./game";
import { ROOM_CODE_LENGTH } from "./ids";
import type { Room } from "./types";

function roomWithPlayers(n: number, now = 1_000_000): { room: Room; tokens: string[]; ids: string[] } {
  let room = createRoom(now);
  room.code = "TEST";
  room = setStartingMoney(room, 100);
  room = addItem(room, "Gilded compass");
  room = addItem(room, "Silent bell");
  const tokens: string[] = [];
  const ids: string[] = [];
  const selfie = "data:image/jpeg;base64,aaa";
  for (let i = 0; i < n; i++) {
    const joined = joinPlayer(room, `P${i + 1}`, selfie, now);
    room = joined.room;
    tokens.push(joined.player.token);
    ids.push(joined.player.id);
  }
  return { room, tokens, ids };
}

test("new rooms use a long QR secret and stop at 40 participants", () => {
  const now = 4_000_000;
  let room = createRoom(now);
  assert.equal(room.code.length, ROOM_CODE_LENGTH);
  const selfie = "data:image/jpeg;base64,aaa";
  for (let i = 0; i < MAX_PLAYERS; i++) {
    room = joinPlayer(room, `P${i + 1}`, selfie, now).room;
  }
  assert.equal(room.players.length, 40);
  assert.throws(() => joinPlayer(room, "P41", selfie, now), /40 participants/);
});

test("sealed unique high reveals and opens; winner is deducted into storage", () => {
  const now = 5_000_000;
  let { room, ids } = roomWithPlayers(2, now);
  room = startEvening(room, now);
  room = submitSealedBid(room, ids[0], 40, false, now + 100);
  room = submitSealedBid(room, ids[1], 25, false, now + 200);
  const hidden = toClient(room, { now: now + 300 });
  assert.equal(hidden.currentHigh, null);
  room = tick(room, now + 20_000);
  assert.equal(room.phase, "open");
  assert.equal(room.currentHigh?.playerId, ids[0]);
  assert.equal(room.currentHigh?.amount, 40);
  const view = toClient(room, { now: now + 20_001 });
  assert.equal(view.currentHigh?.nickname, "P1");
  assert.equal(view.currentHigh?.amount, 40);
  room = awardWinner(room, now + 21_000);
  assert.equal(room.phase, "awarded");
  const winner = room.players.find((p) => p.id === ids[0])!;
  assert.equal(winner.balance, 60);
  assert.equal(winner.storage[0]?.itemName, "Gilded compass");
  assert.equal(winner.storage[0]?.amount, 40);
});

test("cannot bid above balance; pass cannot raise in open", () => {
  const now = 6_000_000;
  let { room, ids } = roomWithPlayers(2, now);
  room = startEvening(room, now);
  assert.throws(() => submitSealedBid(room, ids[0], 101, false, now + 10), /balance/);
  room = submitSealedBid(room, ids[0], 10, false, now + 20);
  room = submitSealedBid(room, ids[1], 0, true, now + 30);
  room = tick(room, now + 20_000);
  assert.equal(room.phase, "open");
  assert.throws(() => raiseBid(room, ids[1], 11, now + 20_100), /sealed round/);
  room = raiseBid(room, ids[0], 12, now + 20_200);
  assert.equal(room.currentHigh?.amount, 12);
});

test("ties: only tied players re-bid higher until unique high", () => {
  const now = 7_000_000;
  let { room, ids } = roomWithPlayers(3, now);
  room = startEvening(room, now);
  room = submitSealedBid(room, ids[0], 50, false, now + 10);
  room = submitSealedBid(room, ids[1], 50, false, now + 20);
  room = submitSealedBid(room, ids[2], 10, false, now + 30);
  room = tick(room, now + 20_000);
  assert.equal(room.phase, "tiebreak");
  assert.deepEqual(room.tiedIds.sort(), [ids[0], ids[1]].sort());
  assert.throws(() => submitSealedBid(room, ids[2], 60, false, now + 20_100), /tied leaders/);
  assert.throws(() => submitSealedBid(room, ids[0], 50, false, now + 20_200), /higher than 50/);
  room = submitSealedBid(room, ids[0], 55, false, now + 20_300);
  room = submitSealedBid(room, ids[1], 70, false, now + 20_400);
  room = tick(room, now + 20_000 + 15_000);
  assert.equal(room.phase, "open");
  assert.equal(room.currentHigh?.playerId, ids[1]);
  assert.equal(room.currentHigh?.amount, 70);
});

test("host can break a tie; first valid open raise wins the raise", () => {
  const now = 8_000_000;
  let { room, ids } = roomWithPlayers(2, now);
  room = startEvening(room, now);
  room = submitSealedBid(room, ids[0], 30, false, now + 10);
  room = submitSealedBid(room, ids[1], 30, false, now + 20);
  room = tick(room, now + 20_000);
  assert.equal(room.phase, "tiebreak");
  room = breakTie(room, ids[0], now + 20_500);
  assert.equal(room.phase, "open");
  assert.equal(room.currentHigh?.playerId, ids[0]);
  room = raiseBid(room, ids[1], 31, now + 20_600);
  assert.equal(room.currentHigh?.playerId, ids[1]);
  assert.throws(() => raiseBid(room, ids[0], 31, now + 20_700), /higher than 31/);
});

test("the third lot can be smile, and traditional chinese names round-trip as JSON", () => {
  let room = createRoom(1_700_000_000_000);
  room = addItem(room, "First light");
  room = addItem(room, "Second bell");
  room = addItem(room, "smile");
  room = addItem(room, "龍紋玉珮", "清代 翠玉");
  room = addItem(room, "smile\u0000");
  assert.equal(room.items[2]?.name, "smile");
  assert.equal(room.items[3]?.name, "龍紋玉珮");
  assert.equal(room.items[3]?.notes, "清代 翠玉");
  assert.equal(room.items[4]?.name, "smile");
  const view = toClient(room, { hostToken: room.hostToken, now: 1_700_000_000_000 });
  const parsed = JSON.parse(JSON.stringify(view)) as typeof view;
  assert.equal(parsed.items[2]?.name, "smile");
  assert.equal(parsed.items[3]?.name, "龍紋玉珮");
  assert.equal(parsed.items[3]?.notes, "清代 翠玉");
  assert.equal(JSON.stringify(view).charCodeAt(0), 123);
});

test("next lot starts a fresh sealed window; unsold if nobody bids", () => {
  const now = 9_000_000;
  let { room, ids } = roomWithPlayers(1, now);
  room = startEvening(room, now);
  room = submitSealedBid(room, ids[0], 0, true, now + 10);
  room = tick(room, now + 20_000);
  assert.equal(room.phase, "awarded");
  assert.equal(room.lastAward?.sold, false);
  room = startNextLot(room, now + 21_000);
  assert.equal(room.phase, "sealed");
  assert.equal(room.currentItemIndex, 1);
  room = submitSealedBid(room, ids[0], 8, false, now + 21_100);
  room = tick(room, now + 21_000 + 20_000);
  room = awardWinner(room, now + 42_000);
  assert.equal(room.players[0]?.storage[0]?.itemName, "Silent bell");
  room = startNextLot(room, now + 43_000);
  assert.equal(room.phase, "ended");
});
