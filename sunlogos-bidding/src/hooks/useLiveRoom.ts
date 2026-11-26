"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchRoom } from "@/lib/client";
import type { ClientRoom } from "@/lib/types";

export function useLiveRoom(
  code: string,
  tokens: { hostToken?: string | null; playerToken?: string | null },
) {
  const [room, setRoom] = useState<ClientRoom | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchRoom(code, tokens);
      setRoom(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lost the room");
    }
  }, [code, tokens.hostToken, tokens.playerToken]);

  useEffect(() => {
    let cancelled = false;
    const headers: Record<string, string> = {};
    if (tokens.hostToken) headers["x-host-token"] = tokens.hostToken;
    if (tokens.playerToken) headers["x-player-token"] = tokens.playerToken;

    void refresh();

    const poll = setInterval(() => {
      if (!cancelled) void refresh();
    }, 450);

    const abort = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/rooms/${code.toUpperCase()}/events`, {
          headers,
          signal: abort.signal,
          cache: "no-store",
        });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.split("\n").find((row) => row.startsWith("data: "));
            if (!line) continue;
            try {
              const data = JSON.parse(line.slice(6).replace(/^\uFEFF/, "")) as ClientRoom;
              if (data?.code && !cancelled) {
                setRoom(data);
                setError(null);
              }
            } catch {
              /* ignore malformed chunk */
            }
          }
        }
      } catch {
        /* polling remains */
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(poll);
      abort.abort();
    };
  }, [code, refresh, tokens.hostToken, tokens.playerToken]);

  return { room, error, setRoom, refresh };
}
