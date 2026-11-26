/** Keep the newest room. An older in-flight poll must not wipe a save that already landed. */
export function preferRoom<T extends { version: number; serverNow: number }>(prev: T | null, next: T): T {
  if (!prev) return next;
  if (next.version !== prev.version) return next.version > prev.version ? next : prev;
  return next.serverNow >= prev.serverNow ? next : prev;
}
