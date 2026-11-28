"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchRoom } from "@/lib/client";
import { preferRoom } from "@/lib/live";
import type { ClientRoom } from "@/lib/types";

export function useLiveRoom(
  code: string,
  tokens: { hostToken?: string | null; playerToken?: string | null },
) {
  const [room, setRoomState] = useState<ClientRoom | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setRoom = useCallback((next: ClientRoom) => {
    setRoomState((prev) => preferRoom(prev, next));
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchRoom(code, tokens);
      setRoom(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lost the room");
    }
  }, [code, setRoom, tokens.hostToken, tokens.playerToken]);

  useEffect(() => {
    let cancelled = false;
    const headers: Record<string, string> = { accept: "text/event-stream" };
    if (tokens.hostToken) headers["x-host-token"] = tokens.hostToken;
    if (tokens.playerToken) headers["x-player-token"] = tokens.playerToken;

    void refresh();
    let sseAt = 0;
    let pollTick = 0;
    const poll = setInterval(() => {
      if (cancelled) return;
      pollTick += 1;
      const sseFresh = Date.now() - sseAt < 2_000;
      if (sseFresh && pollTick % 8 !== 0) return;
      void refresh();
    }, 400);

    const abort = new AbortController();
    void (async () => {
      const decoder = new TextDecoder();
      while (!cancelled) {
        try {
          const res = await fetch(`/api/rooms/${code.toUpperCase()}/events`, {
            headers,
            signal: abort.signal,
            cache: "no-store",
          });
          if (!res.ok || !res.body) {
            await new Promise((resolve) => setTimeout(resolve, 300));
            continue;
          }
          const reader = res.body.getReader();
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
                if (data?.code && typeof data.version === "number" && !cancelled) {
                  sseAt = Date.now();
                  setRoom(data);
                }
              } catch {
                /* ignore a partial frame */
              }
            }
          }
        } catch {
          if (cancelled) return;
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(poll);
      abort.abort();
    };
  }, [code, refresh, setRoom, tokens.hostToken, tokens.playerToken]);

  return { room, error, setRoom, refresh };
}
