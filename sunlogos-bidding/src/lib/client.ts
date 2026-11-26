import type { ClientRoom } from "./types";
import { preferRoom } from "./live";

export { preferRoom };

export function hostKey(code: string) {
  return `sunlogos:host:${code.toUpperCase()}`;
}

export function playerKey(code: string) {
  return `sunlogos:player:${code.toUpperCase()}`;
}

export function readHostToken(code: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(hostKey(code));
}

export function readPlayerToken(code: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(playerKey(code));
}

export function authHeaders(opts: { hostToken?: string | null; playerToken?: string | null }): HeadersInit {
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
  };
  if (opts.hostToken) headers["x-host-token"] = opts.hostToken;
  if (opts.playerToken) headers["x-player-token"] = opts.playerToken;
  return headers;
}

/** Firefox's response.json() throws this when the body is HTML, a BOM, or empty. */
export class UnreadableResponse extends Error {
  constructor() {
    super("The room sent an unreadable reply.");
    this.name = "UnreadableResponse";
  }
}

export function unreadableResponse(error: unknown): boolean {
  return error instanceof UnreadableResponse;
}

export async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = (await res.text()).replace(/^\uFEFF/, "").trim();
  if (!text) throw new UnreadableResponse();
  try {
    const data = JSON.parse(text) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new UnreadableResponse();
    return data as Record<string, unknown>;
  } catch (error) {
    if (error instanceof UnreadableResponse) throw error;
    throw new UnreadableResponse();
  }
}

function errorMessage(data: Record<string, unknown>, fallback: string): string {
  return typeof data.error === "string" && data.error ? data.error : fallback;
}

export async function fetchRoom(
  code: string,
  opts: { hostToken?: string | null; playerToken?: string | null },
): Promise<ClientRoom> {
  const res = await fetch(`/api/rooms/${code.toUpperCase()}`, {
    headers: authHeaders(opts),
    cache: "no-store",
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(errorMessage(data, "Room not found"));
  return asRoom(data);
}

export async function hostAction(
  code: string,
  hostToken: string,
  action: Record<string, unknown>,
): Promise<ClientRoom> {
  const res = await fetch(`/api/rooms/${code.toUpperCase()}`, {
    method: "PATCH",
    headers: authHeaders({ hostToken }),
    body: JSON.stringify(action),
    cache: "no-store",
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(errorMessage(data, "Action failed"));
  return asRoom(data);
}

export async function joinRoom(code: string, nickname: string, selfieDataUrl: string) {
  const res = await fetch(`/api/rooms/${code.toUpperCase()}/join`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ nickname, selfieDataUrl }),
    cache: "no-store",
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(errorMessage(data, "Could not join"));
  const playerToken = data.playerToken;
  if (typeof playerToken !== "string" || !data.room || typeof data.room !== "object") {
    throw new UnreadableResponse();
  }
  localStorage.setItem(playerKey(code), playerToken);
  return data as { playerId: string; playerToken: string; room: ClientRoom };
}

function asRoom(data: Record<string, unknown>): ClientRoom {
  if (typeof data.code !== "string" || typeof data.phase !== "string" || typeof data.version !== "number") {
    throw new UnreadableResponse();
  }
  return data as ClientRoom;
}

function bidLanded(room: ClientRoom, body: { amount?: number; pass?: boolean; raise?: boolean }): boolean {
  const you = room.you;
  if (!you) return false;
  if (body.raise) return Boolean(you.youAreHigh && room.currentHigh?.amount === body.amount);
  if (body.pass) return you.passed;
  return you.submitted && !you.passed && you.yourBid === body.amount;
}

async function postBid(
  code: string,
  playerToken: string,
  body: { amount?: number; pass?: boolean; raise?: boolean },
): Promise<ClientRoom> {
  const res = await fetch(`/api/rooms/${code.toUpperCase()}/bid`, {
    method: "POST",
    headers: authHeaders({ playerToken }),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(errorMessage(data, "Bid failed"));
  return asRoom(data);
}

export async function sendBid(
  code: string,
  playerToken: string,
  body: { amount?: number; pass?: boolean; raise?: boolean },
): Promise<ClientRoom> {
  try {
    return await postBid(code, playerToken, body);
  } catch (err) {
    if (!unreadableResponse(err)) throw err;
    try {
      const fresh = await fetchRoom(code, { playerToken });
      if (bidLanded(fresh, body)) return fresh;
    } catch {
      /* the first reply was unreadable; try the bid once more */
    }
    return await postBid(code, playerToken, body);
  }
}

export async function replacePhoto(code: string, playerToken: string, selfieDataUrl: string): Promise<ClientRoom> {
  const res = await fetch(`/api/rooms/${code.toUpperCase()}/photo`, {
    method: "PATCH",
    headers: authHeaders({ playerToken }),
    body: JSON.stringify({ selfieDataUrl }),
    cache: "no-store",
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(errorMessage(data, "Could not replace the photo"));
  return asRoom(data);
}

export function money(n: number): string {
  return `☉ ${n.toLocaleString("en-US")}`;
}

export function phaseLabel(phase: ClientRoom["phase"]): string {
  switch (phase) {
    case "lobby":
      return "Gathering";
    case "sealed":
      return "Sealed bids";
    case "tiebreak":
      return "Tie — bid higher";
    case "open":
      return "Open floor";
    case "awarded":
      return "Lot settled";
    case "ended":
      return "Evening closed";
  }
}
