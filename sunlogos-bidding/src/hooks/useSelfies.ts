"use client";

import { useEffect, useRef, useState } from "react";
import { readJson } from "@/lib/client";

export function useSelfies(
  code: string,
  refs: { id: string; version: number }[],
  hostToken?: string | null,
) {
  const [map, setMap] = useState<Record<string, string>>({});
  const loaded = useRef(new Set<string>());
  const key = refs.map((ref) => `${ref.id}:${ref.version}`).join("|");

  useEffect(() => {
    if (!hostToken) return;
    let cancelled = false;
    async function load() {
      const current = key.split("|").filter(Boolean).map((part) => {
        const cut = part.lastIndexOf(":");
        return { id: part.slice(0, cut), version: Number(part.slice(cut + 1)) };
      });
      for (const ref of current) {
        if (!ref.id) continue;
        const cacheKey = `${ref.id}:${ref.version}`;
        if (loaded.current.has(cacheKey)) continue;
        loaded.current.add(cacheKey);
        try {
          const res = await fetch(`/api/rooms/${code.toUpperCase()}/selfie/${ref.id}`, {
            cache: "no-store",
            headers: { accept: "application/json", "x-host-token": hostToken! },
          });
          if (!res.ok) {
            loaded.current.delete(cacheKey);
            continue;
          }
          const data = await readJson(res);
          if (typeof data.selfieDataUrl !== "string") {
            loaded.current.delete(cacheKey);
            continue;
          }
          if (!cancelled) {
            setMap((prev) => ({ ...prev, [ref.id]: data.selfieDataUrl as string }));
          }
        } catch {
          loaded.current.delete(cacheKey);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [code, hostToken, key]);

  return map;
}
