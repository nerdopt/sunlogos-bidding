import { GameError } from "./types";

const hits = new Map<string, number[]>();
const live = new Map<string, number>();

function prune(stamps: number[], windowMs: number, now: number) {
  return stamps.filter((stamp) => now - stamp < windowMs);
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = prune(hits.get(key) ?? [], windowMs, now);
  if (recent.length >= limit) {
    hits.set(key, recent);
    throw new GameError("Too many requests — wait a moment", 429);
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 2000) {
    for (const [bucket, stamps] of hits) {
      const kept = prune(stamps, windowMs, now);
      if (kept.length === 0) hits.delete(bucket);
      else hits.set(bucket, kept);
    }
  }
}

export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = request.headers.get("x-real-ip")?.trim();
  return forwarded || real || "local";
}

/** Caps simultaneous live streams for one room. Caller must release the slot. */
export function acquireLiveSlot(code: string, max = 48): () => void {
  const key = code.toUpperCase();
  const current = live.get(key) ?? 0;
  if (current >= max) throw new GameError("Too many live connections", 429);
  live.set(key, current + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = (live.get(key) ?? 1) - 1;
    if (next <= 0) live.delete(key);
    else live.set(key, next);
  };
}
