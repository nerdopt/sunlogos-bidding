"use client";

import { useEffect, useRef, useState } from "react";

export function Countdown({
  endsAt,
  serverNow,
  size = "display",
}: {
  endsAt: number | null;
  serverNow: number;
  size?: "display" | "compact";
}) {
  const origin = useRef({ local: 0, server: serverNow });
  const [stamp, setStamp] = useState<number | null>(null);

  useEffect(() => {
    origin.current = { local: Date.now(), server: serverNow };
    setStamp(Date.now());
    const id = setInterval(() => setStamp(Date.now()), 100);
    return () => clearInterval(id);
  }, [endsAt, serverNow]);

  if (!endsAt) return null;
  const elapsed = stamp === null ? 0 : stamp - origin.current.local;
  const remaining = Math.max(0, endsAt - origin.current.server - elapsed);
  const seconds = Math.ceil(remaining / 1000);
  const urgent = seconds <= 5;
  const cls = size === "compact" ? "font-display text-6xl leading-none tracking-tight" : "countdown";
  return (
    <div className={`${cls} ${urgent ? "text-ember" : "text-cream"}`} suppressHydrationWarning>
      {stamp === null ? "—" : String(seconds).padStart(2, "0")}
      <span className="ml-3 font-sans text-base tracking-[0.4em] text-cream/40">SEC</span>
    </div>
  );
}
