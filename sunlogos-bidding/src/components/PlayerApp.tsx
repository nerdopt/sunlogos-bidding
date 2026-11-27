"use client";

import { useEffect, useState } from "react";
import { Atmosphere, Face, SunMark } from "@/components/Atmosphere";
import { Countdown } from "@/components/Countdown";
import { SelfieCapture } from "@/components/SelfieCapture";
import { useLiveRoom } from "@/hooks/useLiveRoom";
import { joinRoom, money, phaseLabel, readJson, readPlayerToken, replacePhoto, sendBid } from "@/lib/client";
import { textLang } from "@/lib/text";
import type { ClientRoom } from "@/lib/types";

export function PlayerApp({ code }: { code: string }) {
  const upper = code.toUpperCase();
  const [playerToken, setPlayerToken] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [selfie, setSelfie] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [storageOpen, setStorageOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [bidError, setBidError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setPlayerToken(readPlayerToken(upper));
  }, [upper]);

  const { room, error, setRoom } = useLiveRoom(upper, { playerToken });

  useEffect(() => {
    if (!room?.you) return;
    if (room.phase === "open") setAmount(String(room.you.minRaise));
    if (room.phase === "sealed" || room.phase === "tiebreak") {
      setAmount(room.you.yourBid ? String(room.you.yourBid) : "");
    }
  }, [room?.phase, room?.you?.minRaise, room?.you?.yourBid]);

  async function onJoin(e: React.FormEvent) {
    e.preventDefault();
    setJoining(true);
    setJoinError(null);
    try {
      const data = await joinRoom(upper, nickname, selfie);
      setPlayerToken(data.playerToken);
      setRoom(data.room);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Could not join");
    } finally {
      setJoining(false);
    }
  }

  async function bid(opts: { pass?: boolean; raise?: boolean }) {
    if (!playerToken) return;
    setSending(true);
    setBidError(null);
    try {
      const next = await sendBid(upper, playerToken, {
        amount: Number(amount),
        pass: opts.pass,
        raise: opts.raise,
      });
      setRoom(next);
    } catch (err) {
      setBidError(err instanceof Error ? err.message : "Bid failed");
    } finally {
      setSending(false);
    }
  }

  if (error && !room) {
    return (
      <Shell>
        <p className="text-ember">{error}</p>
        <a href="/" className="btn-ghost mt-4">
          Home
        </a>
      </Shell>
    );
  }

  if (!room) {
    return (
      <Shell>
        <p className="tracking-[0.3em] text-cream/50">FINDING THE ROOM…</p>
      </Shell>
    );
  }

  if (!playerToken || !room.you) {
    return (
      <Shell>
        <SunMark className="mx-auto h-14 w-14" />
        <p className="mt-3 text-center text-[11px] uppercase tracking-[0.4em] text-gold">Sunlogos</p>
        <h1 className="mt-2 text-center text-4xl">Take your seat</h1>
        <form onSubmit={(e) => void onJoin(e)} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-xs uppercase tracking-[0.2em] text-cream/45">Nickname</span>
            <input
              className="field mt-1"
              maxLength={20}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="What shall we call you?"
              required
            />
          </label>
          <SelfieCapture value={selfie} onChange={setSelfie} />
          {joinError && <p className="text-sm text-ember">{joinError}</p>}
          <button type="submit" className="btn-gold w-full py-3" disabled={joining || !selfie || nickname.trim().length < 2}>
            {joining ? "Entering…" : "Enter the room"}
          </button>
        </form>
      </Shell>
    );
  }

  const you = room.you;
  const spent = you.storage.reduce((sum, row) => sum + row.amount, 0);

  return (
    <Shell>
      <header className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.35em] text-gold">Sunlogos</p>
          <p className="font-display text-2xl">{you.nickname}</p>
        </div>
        <button type="button" onClick={() => setStorageOpen(true)} className="text-right">
          <p className="text-[11px] uppercase tracking-[0.2em] text-cream/40">Balance</p>
          <p className="font-display text-2xl text-gold">{money(you.balance)}</p>
        </button>
      </header>

      <p className="mt-4 text-center text-[11px] uppercase tracking-[0.3em] text-cream/45">{phaseLabel(room.phase)}</p>

      {room.currentItem && room.phase !== "lobby" && room.phase !== "ended" && (
        <h2 className="mt-2 text-center text-4xl leading-none" lang={textLang(room.currentItem.name)}>
          {room.currentItem.name}
        </h2>
      )}

      {(room.phase === "sealed" || room.phase === "tiebreak") && (
        <div className="mt-3 text-center">
          <Countdown endsAt={room.sealedEndsAt} serverNow={room.serverNow} size="compact" />
        </div>
      )}

      {room.phase === "lobby" && !room.sessionStarted && playerToken && (
        <PhotoReplace code={upper} playerToken={playerToken} onRoom={setRoom} />
      )}

      {room.phase === "lobby" && (
        <p className="mt-8 text-center font-display text-3xl text-cream/70">
          Wait for the host to open the floor.
          <span className="mt-3 block font-sans text-base tracking-normal text-gold">{money(you.balance)} when it begins.</span>
        </p>
      )}

      {room.phase === "sealed" && !room.sealedEndsAt && (
        <p className="mt-8 text-center font-display text-3xl text-cream/70">Waiting for the countdown.</p>
      )}

      {room.phase === "ended" && (
        <p className="mt-10 text-center font-display text-3xl">The evening is closed.</p>
      )}

      {room.phase === "open" && room.currentHigh && (
        <div className="mt-6 flex flex-col items-center gap-3">
          <Face name={room.currentHigh.nickname} size="lg" />
          <p>
            {you.youAreHigh ? "You lead" : room.currentHigh.nickname} at{" "}
            <span className="text-gold">{money(room.currentHigh.amount)}</span>
          </p>
        </div>
      )}

      {room.phase === "tiebreak" && (
        <div className="mt-4 text-center text-cream/70">
          {you.youAreTied
            ? `You are tied — bid higher than ${money(room.tiedLeaders[0]?.amount ?? 0)}. If nobody does, the earliest bid takes it.`
            : "Waiting on tied leaders. If nobody bids higher, the earliest bid takes it."}
        </div>
      )}

      {room.phase === "awarded" && room.lastAward && (
        <div className="mt-8 text-center">
          {room.lastAward.sold ? (
            <>
              <Face name={room.lastAward.nickname} size="lg" />
              <p className="mt-3 font-display text-3xl">
                {room.lastAward.playerId === you.playerId ? "You won" : room.lastAward.nickname} · {money(room.lastAward.amount)}
              </p>
            </>
          ) : (
            <p className="font-display text-3xl">Unsold</p>
          )}
        </div>
      )}

      {you.balance <= 0 &&
        room.sessionStarted &&
        (room.phase === "sealed" || room.phase === "tiebreak" || room.phase === "open") && (
          <p className="mt-8 text-center font-display text-3xl text-cream/80">You have ran out of money</p>
        )}

      {(you.canBid || you.canRaise) && you.balance > 0 && (
        <form
          className="mt-5 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void bid(you.canRaise ? { raise: true } : {});
          }}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-ghost px-4"
              onClick={() => setAmount(String(Math.max(0, Number(amount || 0) - 1)))}
            >
              −
            </button>
            <input
              className="field text-center font-display text-4xl"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
            />
            <button
              type="button"
              className="btn-ghost px-4"
              onClick={() => setAmount(String(Number(amount || 0) + 1))}
            >
              +
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-ghost flex-1"
              onClick={() => setAmount(String(you.balance))}
            >
              Max {money(you.balance)}
            </button>
            {you.canRaise && (
              <button type="button" className="btn-ghost flex-1" onClick={() => setAmount(String(you.minRaise))}>
                Min {money(you.minRaise)}
              </button>
            )}
          </div>
          {bidError && <p className="text-sm text-ember">{bidError}</p>}
          {you.canBid && !you.passed && (
            <div className="flex gap-2">
              <button type="submit" className="btn-gold flex-1 py-3" disabled={sending}>
                {you.submitted ? "Update bid" : "Submit bid"}
              </button>
              {you.canPass && (
                <button type="button" className="btn-ghost" disabled={sending} onClick={() => void bid({ pass: true })}>
                  Pass
                </button>
              )}
            </div>
          )}
          {you.canRaise && (
            <button type="submit" className="btn-ember w-full py-3" disabled={sending}>
              Raise
            </button>
          )}
        </form>
      )}

      {you.submitted && room.phase === "sealed" && (
        <p className="mt-6 text-center text-cream/55">
          {you.passed ? "You passed this lot." : `Your sealed bid is in (${money(you.yourBid ?? 0)}).`}
        </p>
      )}

      {!you.canBid && !you.canRaise && room.phase === "open" && (
        <p className="mt-8 text-center text-cream/50">
          {you.passed ? "You passed — you cannot raise." : "Only sealed bidders may raise."}
        </p>
      )}

      <button type="button" className="btn-ghost mt-10 w-full" onClick={() => setStorageOpen(true)}>
        My storage · {you.storage.length} lots · spent {money(spent)}
      </button>

      {storageOpen && (
        <div className="fixed inset-0 z-20 bg-black/70 p-4 backdrop-blur-sm" onClick={() => setStorageOpen(false)}>
          <div className="panel mx-auto mt-16 max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-3xl">Storage</h3>
              <button type="button" className="btn-ghost py-1" onClick={() => setStorageOpen(false)}>
                Close
              </button>
            </div>
            <p className="mt-2 text-gold">{money(you.balance)} remaining</p>
            <ul className="mt-4 space-y-3">
              {you.storage.length === 0 && <li className="text-cream/50">Nothing won yet.</li>}
              {you.storage.map((row) => (
                <li key={row.itemId} className="flex justify-between border-b border-cream/10 pb-2">
                  <span lang={textLang(row.itemName)}>{row.itemName}</span>
                  <span className="text-gold">{money(row.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Shell>
  );
}

function PhotoReplace({
  code,
  playerToken,
  onRoom,
}: {
  code: string;
  playerToken: string;
  onRoom: (room: ClientRoom) => void;
}) {
  const [current, setCurrent] = useState("");
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/rooms/${code}/photo`, {
          cache: "no-store",
          headers: { accept: "application/json", "x-player-token": playerToken },
        });
        const data = await readJson(res);
        if (!cancelled && res.ok && typeof data.selfieDataUrl === "string") setCurrent(data.selfieDataUrl);
      } catch {
        /* the player can still take a new photo */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, playerToken]);

  async function save(url: string) {
    if (!url) return;
    setBusy(true);
    setError(null);
    try {
      const next = await replacePhoto(code, playerToken, url);
      onRoom(next);
      setCurrent(url);
      setDraft("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not replace the photo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      {current && !open && (
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current} alt="" className="h-24 w-24 rounded-full border-2 border-gold object-cover" />
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => setOpen(true)}>
            Replace photo
          </button>
        </div>
      )}
      {(open || !current) && (
        <div className="space-y-3">
          <SelfieCapture
            label="Replace photo"
            value={draft}
            onChange={(url) => {
              setDraft(url);
              if (url) void save(url);
            }}
          />
          {current && (
            <button type="button" className="btn-ghost w-full" disabled={busy} onClick={() => setOpen(false)}>
              Keep this photo
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-center text-sm text-ember">{error}</p>}
      <p className="mt-3 text-center text-xs text-cream/45">You can change your photo until the host starts.</p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-dvh">
      <Atmosphere />
      <div className="relative z-10 mx-auto max-w-md px-5 py-6">{children}</div>
    </main>
  );
}
