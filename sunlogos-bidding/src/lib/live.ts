/** A late server sample must not paint a higher second than the one already shown. */
export function forwardRemaining(shown: number | null, estimate: number): number {
  const next = Math.max(0, estimate);
  if (shown === null) return next;
  return Math.min(shown, next);
}

/** Keep the newest room. An older in-flight poll must not wipe a save that already landed. */
export function preferRoom<T extends { version: number; serverNow: number }>(prev: T | null, next: T): T {
  if (!prev) return next;
  if (next.version !== prev.version) return next.version > prev.version ? next : prev;
  return next.serverNow >= prev.serverNow ? next : prev;
}

type ActionSnap = {
  version: number;
  phase: string;
  startingMoney: number;
  currentItemIndex: number;
  sealedEndsAt: number | null;
  sessionStarted: boolean;
  items: { name: string }[];
};

/** True when a host click is already visible, so a lost reply must not be sent again. */
export function actionLanded(before: ActionSnap, after: ActionSnap, action: { type?: unknown; name?: unknown; amount?: unknown }): boolean {
  switch (action.type) {
    case "addItem": {
      const name = String(action.name ?? "").trim();
      const count = (items: { name: string }[]) => items.filter((item) => item.name === name).length;
      return count(after.items) > count(before.items);
    }
    case "setStartingMoney":
      return after.version > before.version && after.startingMoney === Number(action.amount);
    case "startCountdown":
      return before.sealedEndsAt === null && after.sealedEndsAt !== null;
    case "startNextLot":
      return after.currentItemIndex > before.currentItemIndex || (before.phase !== "ended" && after.phase === "ended");
    case "awardWinner":
      return before.phase !== "awarded" && after.phase === "awarded";
    case "startEvening":
      return !before.sessionStarted && after.sessionStarted;
    case "removeItem":
      return after.version > before.version && after.items.length < before.items.length;
    default:
      return after.version > before.version;
  }
}
