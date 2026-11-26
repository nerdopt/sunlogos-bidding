"use client";

import { useEffect, useRef, useState } from "react";
import { readJson } from "@/lib/client";

export function useSelfies(code: string, playerIds: string[], hostToken?: string | null) {
  const [map, setMap] = useState<Record<string, string>>({});
  const loaded = useRef(new Set<string>());

  useEffect(() => {
    if (!hostToken) return;
    let cancelled = false;
    async function load() {
      for (const playerId of playerIds) {
        if (!playerId || loaded.current.has(playerId)) continue;
        loaded.current.add(playerId);
        try {
          const res = await fetch(`/api/rooms/${code.toUpperCase()}/selfie/${playerId}`, {
            cache: "no-store",
            headers: { accept: "application/json", "x-host-token": hostToken! },
          });
          if (!res.ok) {
            loaded.current.delete(playerId);
            continue;
          }
          const data = await readJson(res);
          if (typeof data.selfieDataUrl !== "string") {
            loaded.current.delete(playerId);
            continue;
          }
          if (!cancelled) {
            setMap((prev) => ({ ...prev, [playerId]: data.selfieDataUrl as string }));
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
  }, [code, hostToken, playerIds.join("|")]);

  return map;
}
