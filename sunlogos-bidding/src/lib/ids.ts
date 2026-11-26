import { randomBytes, randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const ROOM_CODE_LENGTH = 22;

export function roomCode(): string {
  let out = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function token(): string {
  return randomBytes(18).toString("base64url");
}

export function id(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}
