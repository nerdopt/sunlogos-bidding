"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Atmosphere, SunMark } from "@/components/Atmosphere";
import { hostKey, readJson } from "@/lib/client";

export default function HomePage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createRoom() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not open a room");
      if (typeof data.code !== "string" || typeof data.hostToken !== "string") {
        throw new Error("Could not open a room");
      }
      localStorage.setItem(hostKey(data.code), data.hostToken);
      router.push(`/host/${data.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open a room");
      setCreating(false);
    }
  }

  return (
    <main className="relative min-h-screen">
      <Atmosphere />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
        <SunMark className="h-24 w-24" />
        <p className="mt-8 text-[12px] uppercase tracking-[0.55em] text-gold">Sunlogos</p>
        <h1 className="mt-3 max-w-3xl text-6xl leading-[0.9] md:text-8xl">The evening&apos;s lots, live in the room.</h1>
        <p className="mt-6 max-w-xl text-lg text-cream/70">
          Host on the big screen. Players join only by scanning the QR — there is no room code to type. Up to
          40 people. Sealed bids, then an open floor — first raise wins the lead.
        </p>
        {error && <p className="mt-4 text-ember">{error}</p>}
        <div className="mt-10">
          <button type="button" className="btn-gold px-8 py-4 text-lg" disabled={creating} onClick={() => void createRoom()}>
            {creating ? "Opening…" : "Host a room"}
          </button>
        </div>
      </div>
    </main>
  );
}
