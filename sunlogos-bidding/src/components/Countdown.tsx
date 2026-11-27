"use client";

import { useEffect, useRef, useState } from "react";
import { forwardRemaining } from "@/lib/live";

export function Countdown({
  endsAt,
  serverNow,
  size = "display",
}: {
  endsAt: number | null;
  serverNow: number;
  size?: "display" | "compact";
}) {
  const origin = useRef({ local: Date.now(), server: serverNow });
  const shown = useRef<{ endsAt: number; remaining: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    origin.current = { local: Date.now(), server: serverNow };
  }, [endsAt, serverNow]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  if (!endsAt) return null;
  const elapsed = now - origin.current.local;
  const estimate = endsAt - origin.current.server - elapsed;
  const remaining = forwardRemaining(shown.current?.endsAt === endsAt ? shown.current.remaining : null, estimate);
  shown.current = { endsAt, remaining };
  const seconds = Math.ceil(remaining / 1000);
  const urgent = seconds <= 5;
  const cls = size === "compact" ? "font-display text-6xl leading-none tracking-tight" : "countdown";
  return (
    <div className={`${cls} ${urgent ? "text-ember" : "text-cream"}`} suppressHydrationWarning>
      {String(seconds).padStart(2, "0")}
      <span className="ml-3 font-sans text-base tracking-[0.4em] text-cream/40">SEC</span>
    </div>
  );
}
