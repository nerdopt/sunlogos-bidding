"use client";

import { useEffect, useRef, useState } from "react";

export function useSelfies(code: string, playerIds: string[]) {
  const [map, setMap] = useState<Record<string, string>>({});
  const loaded = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      for (const playerId of playerIds) {
        if (!playerId || loaded.current.has(playerId)) continue;
        loaded.current.add(playerId);
        try {
          const res = await fetch(`/api/rooms/${code.toUpperCase()}/selfie/${playerId}`, {
            cache: "no-store",
          });
          if (!res.ok) {
            loaded.current.delete(playerId);
            continue;
          }
          const data = (await res.json()) as { selfieDataUrl: string };
          if (!cancelled) {
            setMap((prev) => ({ ...prev, [playerId]: data.selfieDataUrl }));
          }
        } catch {
          loaded.current.delete(playerId);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [code, playerIds.join("|")]);

  return map;
}
