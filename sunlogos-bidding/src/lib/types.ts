export type Phase = "lobby" | "sealed" | "tiebreak" | "open" | "awarded" | "ended";

export type Item = {
  id: string;
  name: string;
  notes: string;
};

export type WonItem = {
  itemId: string;
  itemName: string;
  amount: number;
};

export type Player = {
  id: string;
  token: string;
  nickname: string;
  selfieDataUrl: string;
  balance: number;
  storage: WonItem[];
  kicked: boolean;
};

export type SealedEntry = {
  amount: number;
  pass: boolean;
};

export type HighBid = {
  playerId: string;
  amount: number;
};

export type LastAward = {
  playerId: string;
  nickname: string;
  itemId: string;
  itemName: string;
  amount: number;
  sold: boolean;
};

export type Room = {
  code: string;
  hostToken: string;
  startingMoney: number;
  sealedDurationMs: number;
  tiebreakDurationMs: number;
  items: Item[];
  players: Player[];
  phase: Phase;
  sessionStarted: boolean;
  currentItemIndex: number;
  sealedEndsAt: number | null;
  version: number;
  createdAt: number;
  sealedBids: Record<string, SealedEntry>;
  eligibleIds: string[];
  currentHigh: HighBid | null;
  tiedIds: string[];
  tieFloor: number;
  lastAward: LastAward | null;
};

export type ClientHigh = {
  playerId: string;
  nickname: string;
  amount: number;
};

export type ClientPlayer = {
  id: string;
  nickname: string;
  balance: number;
  storage: WonItem[];
  kicked: boolean;
};

export type ClientYou = {
  playerId: string;
  nickname: string;
  balance: number;
  storage: WonItem[];
  submitted: boolean;
  passed: boolean;
  yourBid: number | null;
  canBid: boolean;
  canRaise: boolean;
  canPass: boolean;
  youAreTied: boolean;
  youAreHigh: boolean;
  minRaise: number;
};

export type ClientRoom = {
  code: string;
  phase: Phase;
  startingMoney: number;
  items: Item[];
  players: ClientPlayer[];
  currentItemIndex: number;
  currentItem: Item | null;
  sealedEndsAt: number | null;
  serverNow: number;
  submittedCount: number;
  playerCount: number;
  eligibleCount: number;
  currentHigh: ClientHigh | null;
  tiedLeaders: ClientHigh[];
  lastAward: LastAward | null;
  sessionStarted: boolean;
  remainingLots: number;
  you: ClientYou | null;
  isHost: boolean;
};

export class GameError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "GameError";
    this.status = status;
  }
}
