import type { ClientRoom } from "./types";

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
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.hostToken) headers["x-host-token"] = opts.hostToken;
  if (opts.playerToken) headers["x-player-token"] = opts.playerToken;
  return headers;
}

export async function fetchRoom(
  code: string,
  opts: { hostToken?: string | null; playerToken?: string | null },
): Promise<ClientRoom> {
  const res = await fetch(`/api/rooms/${code.toUpperCase()}`, {
    headers: authHeaders(opts),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Room not found");
  return data as ClientRoom;
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
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Action failed");
  return data as ClientRoom;
}

export async function joinRoom(code: string, nickname: string, selfieDataUrl: string) {
  const res = await fetch(`/api/rooms/${code.toUpperCase()}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nickname, selfieDataUrl }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not join");
  localStorage.setItem(playerKey(code), data.playerToken);
  return data as { playerId: string; playerToken: string; room: ClientRoom };
}

export async function sendBid(
  code: string,
  playerToken: string,
  body: { amount?: number; pass?: boolean; raise?: boolean },
): Promise<ClientRoom> {
  const res = await fetch(`/api/rooms/${code.toUpperCase()}/bid`, {
    method: "POST",
    headers: authHeaders({ playerToken }),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Bid failed");
  return data as ClientRoom;
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
