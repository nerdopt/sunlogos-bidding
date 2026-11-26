"use client";

import { useEffect, useMemo, useState } from "react";
import { Atmosphere, Face, SunMark } from "@/components/Atmosphere";
import { Countdown } from "@/components/Countdown";
import { useLiveRoom } from "@/hooks/useLiveRoom";
import { useSelfies } from "@/hooks/useSelfies";
import { fetchRoom, hostAction, money, phaseLabel, readHostToken, unreadableResponse } from "@/lib/client";
import { textLang } from "@/lib/text";
import type { ClientRoom } from "@/lib/types";

const SUGGESTED = [
  "Sun-forged key",
  "The silent bell",
  "Midnight ledger",
  "Copper nightingale",
  "Last light of harvest",
  "Orrey of stolen hours",
];

export function HostApp({ code }: { code: string }) {
  const upper = code.toUpperCase();
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [deskOpen, setDeskOpen] = useState(true);
  const [qr, setQr] = useState("");
  const [lotName, setLotName] = useState("");
  const [lotNotes, setLotNotes] = useState("");
  const [moneyInput, setMoneyInput] = useState("1000");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    setHostToken(readHostToken(upper));
    const url = `${window.location.origin}/r/${upper}`;
    void import("qrcode").then((mod) =>
      mod.default.toDataURL(url, {
        width: 520,
        margin: 1,
        color: { dark: "#1a1208", light: "#f3e6c8" },
      }),
    ).then(setQr);
  }, [upper]);

  const { room, error, setRoom } = useLiveRoom(upper, { hostToken });
  const selfieIds = useMemo(() => {
    if (!room) return [];
    const ids = room.players.map((p) => p.id);
    for (const leader of room.tiedLeaders) ids.push(leader.playerId);
    if (room.currentHigh) ids.push(room.currentHigh.playerId);
    if (room.lastAward?.playerId) ids.push(room.lastAward.playerId);
    return Array.from(new Set(ids));
  }, [room]);
  const selfies = useSelfies(upper, selfieIds, hostToken);

  async function act(action: Record<string, unknown>): Promise<boolean> {
    if (!hostToken) return false;
    const beforeLots = room?.items.length ?? 0;
    setBusy(action.type as string);
    setFlash(null);
    try {
      const next = await hostAction(upper, hostToken, action);
      setRoom(next);
      return true;
    } catch (err) {
      if (unreadableResponse(err)) {
        try {
          const fresh = await fetchRoom(upper, { hostToken });
          setRoom(fresh);
          if (action.type === "addItem" && fresh.items.length <= beforeLots) {
            setFlash("Couldn't save that lot. Try again.");
            return false;
          }
          return true;
        } catch {
          setFlash("Couldn't save that. Try again.");
          return false;
        }
      }
      setFlash(err instanceof Error ? err.message : "Failed");
      return false;
    } finally {
      setBusy(null);
    }
  }

  if (!hostToken) {
    return (
      <main className="relative min-h-screen px-6 py-16">
        <Atmosphere />
        <div className="relative z-10 mx-auto max-w-lg text-center">
          <SunMark className="mx-auto h-20 w-20" />
          <h1 className="mt-6 text-5xl">This desk is locked</h1>
          <p className="mt-4 text-cream/70">
            Host controls live on the computer that opened this screen. Create a new evening from the
            home page.
          </p>
          <a href="/" className="btn-gold mt-8">
            Back
          </a>
        </div>
      </main>
    );
  }

  if (error && !room) {
    return (
      <main className="relative min-h-screen px-6 py-16">
        <Atmosphere />
        <p className="relative z-10 text-center text-ember">{error}</p>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="relative min-h-screen grid place-items-center">
        <Atmosphere />
        <p className="relative z-10 tracking-[0.3em] text-cream/50">LIGHTING THE ROOM…</p>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen">
      <Atmosphere />
      <div className={`relative z-10 grid min-h-screen ${deskOpen ? "lg:grid-cols-[1fr_22rem]" : ""}`}>
        <section className="flex min-h-screen flex-col px-6 py-5 md:px-10">
          <header className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <SunMark className="h-12 w-12" />
              <div>
                <p className="text-[11px] uppercase tracking-[0.42em] text-gold">Sunlogos</p>
                <p className="font-display text-3xl leading-none md:text-4xl">Evening</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-[0.3em] text-cream/45">{phaseLabel(room.phase)}</p>
              <button type="button" className="btn-ghost mt-2 py-1 text-xs" onClick={() => setDeskOpen((v) => !v)}>
                {deskOpen ? "Hide desk" : "Show desk"}
              </button>
            </div>
          </header>

          <div className="flex flex-1 flex-col justify-center py-6">
            {room.phase === "lobby" && <LobbyStage room={room} qr={qr} selfies={selfies} />}
            {room.phase === "sealed" && <SealedStage room={room} />}
            {room.phase === "tiebreak" && <TieStage room={room} selfies={selfies} />}
            {room.phase === "open" && <OpenStage room={room} selfies={selfies} />}
            {room.phase === "awarded" && <AwardStage room={room} selfies={selfies} />}
            {room.phase === "ended" && <EndedStage room={room} selfies={selfies} />}
          </div>
        </section>

        {deskOpen && (
          <aside className="border-t border-cream/10 bg-black/50 p-4 backdrop-blur-md lg:border-l lg:border-t-0">
            <p className="mb-3 text-[11px] uppercase tracking-[0.35em] text-gold/80">Host desk</p>
            {flash && <p className="mb-3 rounded-2xl bg-oxblood/50 px-3 py-2 text-sm">{flash}</p>}
            {!room.sessionStarted && (
              <LobbyDesk
                room={room}
                lotName={lotName}
                lotNotes={lotNotes}
                moneyInput={moneyInput}
                busy={busy}
                onLotName={setLotName}
                onLotNotes={setLotNotes}
                onMoney={setMoneyInput}
                onAct={act}
              />
            )}
            {room.sessionStarted && (
              <PlayDesk room={room} busy={busy} onAct={act} selfies={selfies} />
            )}
          </aside>
        )}
      </div>
    </main>
  );
}

function LobbyStage({
  room,
  qr,
  selfies,
}: {
  room: ClientRoom;
  qr: string;
  selfies: Record<string, string>;
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[auto_1fr]">
      <div className="mx-auto">
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="Join QR code" className="h-64 w-64 rounded-3xl shadow-glow md:h-80 md:w-80" />
        )}
        <p className="mt-4 text-center text-sm uppercase tracking-[0.28em] text-gold">Scan to join</p>
        <p className="mt-2 text-center text-sm text-cream/55">QR only · 40 players</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-cream/45">
          {room.playerCount} / 40 in the room · starting {money(room.startingMoney)}
        </p>
        <div className="mt-5 flex flex-wrap gap-5">
          {room.players.map((p) => (
            <div key={p.id} className="flex w-24 flex-col items-center gap-2 text-center">
              <Face src={selfies[p.id]} name={p.nickname} size="md" />
              <span className="text-sm">{p.nickname}</span>
            </div>
          ))}
          {room.players.length === 0 && (
            <p className="font-display text-3xl text-cream/40">Waiting for the first face…</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SealedStage({ room }: { room: ClientRoom }) {
  return (
    <div className="text-center">
      <p className="text-[12px] uppercase tracking-[0.5em] text-gold">Lot {(room.currentItemIndex ?? 0) + 1}</p>
      <h2 className="mx-auto mt-3 max-w-5xl text-balance text-6xl leading-none md:text-8xl" lang={textLang(room.currentItem?.name)}>
        {room.currentItem?.name}
      </h2>
      {room.currentItem?.notes && (
        <p className="mt-4 text-lg text-cream/60" lang={textLang(room.currentItem.notes)}>
          {room.currentItem.notes}
        </p>
      )}
      <div className="mt-10">
        <Countdown endsAt={room.sealedEndsAt} serverNow={room.serverNow} />
      </div>
      <p className="mt-4 text-cream/50">
        Sealed · {room.submittedCount} of {room.playerCount} in
      </p>
    </div>
  );
}

function TieStage({ room, selfies }: { room: ClientRoom; selfies: Record<string, string> }) {
  return (
    <div className="text-center">
      <p className="text-[12px] uppercase tracking-[0.5em] text-ember">Tied at {money(room.tiedLeaders[0]?.amount ?? 0)}</p>
      <h2 className="mt-3 text-6xl md:text-8xl" lang={textLang(room.currentItem?.name)}>{room.currentItem?.name}</h2>
      <div className="mt-8">
        <Countdown endsAt={room.sealedEndsAt} serverNow={room.serverNow} />
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-8">
        {room.tiedLeaders.map((leader) => (
          <div key={leader.playerId} className="flex flex-col items-center gap-3">
            <Face src={selfies[leader.playerId]} name={leader.nickname} size="lg" />
            <p className="font-display text-3xl">{leader.nickname}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-cream/55">Only these players bid higher. Host may break the tie.</p>
    </div>
  );
}

function OpenStage({ room, selfies }: { room: ClientRoom; selfies: Record<string, string> }) {
  const high = room.currentHigh;
  return (
    <div className="text-center">
      <p className="text-[12px] uppercase tracking-[0.5em] text-gold">
        Open floor · <span lang={textLang(room.currentItem?.name)}>{room.currentItem?.name}</span>
      </p>
      {high ? (
        <div className="mt-8 flex flex-col items-center gap-5">
          <Face src={selfies[high.playerId]} name={high.nickname} size="xl" />
          <p className="font-display text-5xl md:text-6xl">{high.nickname}</p>
          <p className="font-display text-7xl text-gold md:text-8xl">{money(high.amount)}</p>
        </div>
      ) : (
        <p className="mt-10 font-display text-4xl text-cream/50">No standing bid</p>
      )}
      <p className="mt-6 text-cream/45">{room.eligibleCount} may still raise · first higher bid takes the lead</p>
    </div>
  );
}

function AwardStage({ room, selfies }: { room: ClientRoom; selfies: Record<string, string> }) {
  const award = room.lastAward;
  if (!award?.sold) {
    return (
      <div className="text-center">
        <p className="text-[12px] uppercase tracking-[0.5em] text-cream/45">Unsold</p>
        <h2 className="mt-4 text-7xl" lang={textLang(room.currentItem?.name ?? award?.itemName)}>
          {room.currentItem?.name ?? award?.itemName}
        </h2>
        <p className="mt-6 text-cream/55">No sealed bid was placed.</p>
      </div>
    );
  }
  return (
    <div className="text-center">
      <p className="text-[12px] uppercase tracking-[0.5em] text-gold">Sold</p>
      <h2 className="mt-3 text-5xl md:text-7xl" lang={textLang(award.itemName)}>{award.itemName}</h2>
      <div className="mt-8 flex flex-col items-center gap-4">
        <Face src={selfies[award.playerId]} name={award.nickname} size="xl" />
        <p className="font-display text-5xl">{award.nickname}</p>
        <p className="font-display text-6xl text-gold">{money(award.amount)}</p>
      </div>
    </div>
  );
}

function EndedStage({ room, selfies }: { room: ClientRoom; selfies: Record<string, string> }) {
  const ranked = [...room.players].sort((a, b) => a.balance - b.balance);
  return (
    <div>
      <p className="text-center text-[12px] uppercase tracking-[0.5em] text-gold">The books are closed</p>
      <h2 className="mt-3 text-center text-6xl">This evening</h2>
      <ul className="mx-auto mt-10 max-w-2xl space-y-4">
        {ranked.map((p) => (
          <li key={p.id} className="panel flex items-center gap-4">
            <Face src={selfies[p.id]} name={p.nickname} size="sm" />
            <div className="flex-1">
              <p className="font-display text-2xl">{p.nickname}</p>
              <p className="text-sm text-cream/50">
                {p.storage.length
                  ? p.storage.map((s, storageIndex) => (
                      <span key={s.itemId}>
                        {storageIndex > 0 ? " · " : ""}
                        <span lang={textLang(s.itemName)}>{s.itemName}</span> ({money(s.amount)})
                      </span>
                    ))
                  : "No lots"}
              </p>
            </div>
            <p className="font-display text-2xl text-gold">{money(p.balance)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LobbyDesk({
  room,
  lotName,
  lotNotes,
  moneyInput,
  busy,
  onLotName,
  onLotNotes,
  onMoney,
  onAct,
}: {
  room: ClientRoom;
  lotName: string;
  lotNotes: string;
  moneyInput: string;
  busy: string | null;
  onLotName: (v: string) => void;
  onLotNotes: (v: string) => void;
  onMoney: (v: string) => void;
  onAct: (action: Record<string, unknown>) => Promise<boolean>;
}) {
  return (
    <div className="space-y-5 text-sm">
      <label className="block">
        <span className="text-[11px] uppercase tracking-[0.25em] text-cream/45">Starting money</span>
        <div className="mt-1 flex gap-2">
          <input className="field" inputMode="numeric" value={moneyInput} onChange={(e) => onMoney(e.target.value)} />
          <button
            type="button"
            className="btn-ghost px-3"
            disabled={busy !== null}
            onClick={() => void onAct({ type: "setStartingMoney", amount: Number(moneyInput) })}
          >
            Set
          </button>
        </div>
      </label>

      <div>
        <p className="text-[11px] uppercase tracking-[0.25em] text-cream/45">Lots</p>
        <ul className="mt-2 space-y-2">
          {room.items.map((item, index) => (
            <li key={item.id} className="flex items-center gap-2 rounded-2xl bg-white/5 px-3 py-2">
              <span className="w-5 text-cream/40">{index + 1}</span>
              <span className="flex-1" lang={textLang(item.name)}>{item.name}</span>
              <button
                type="button"
                className="text-cream/40 hover:text-gold"
                disabled={index === 0}
                onClick={() => {
                  const ids = room.items.map((i) => i.id);
                  [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
                  void onAct({ type: "reorderItems", itemIds: ids });
                }}
              >
                ↑
              </button>
              <button
                type="button"
                className="text-cream/40 hover:text-gold"
                disabled={index === room.items.length - 1}
                onClick={() => {
                  const ids = room.items.map((i) => i.id);
                  [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]];
                  void onAct({ type: "reorderItems", itemIds: ids });
                }}
              >
                ↓
              </button>
              <button
                type="button"
                className="text-ember"
                onClick={() => void onAct({ type: "removeItem", itemId: item.id })}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!lotName.trim() || busy !== null) return;
            void onAct({ type: "addItem", name: lotName, notes: lotNotes }).then((ok) => {
              if (ok) {
                onLotName("");
                onLotNotes("");
              }
            });
          }}
        >
          <input
            className="field"
            lang="zh-Hant"
            placeholder="Lot name"
            value={lotName}
            onChange={(e) => onLotName(e.target.value)}
          />
          <input
            className="field"
            lang="zh-Hant"
            placeholder="Notes (optional)"
            value={lotNotes}
            onChange={(e) => onLotNotes(e.target.value)}
          />
          <button type="submit" className="btn-ghost w-full" disabled={!lotName.trim() || busy !== null}>
            Add lot
          </button>
        </form>
        <div className="mt-2 flex flex-wrap gap-1">
          {SUGGESTED.map((name) => (
            <button
              key={name}
              type="button"
              className="rounded-full border border-cream/10 px-2 py-1 text-[11px] text-cream/55 hover:border-gold hover:text-gold disabled:opacity-40"
              disabled={busy !== null}
              onClick={() => void onAct({ type: "addItem", name })}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-[0.25em] text-cream/45">Players</p>
        <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
          {room.players.map((p) => (
            <li key={p.id} className="flex items-center justify-between">
              <span>{p.nickname}</span>
              <button type="button" className="text-xs text-ember" onClick={() => void onAct({ type: "kickPlayer", playerId: p.id })}>
                Kick
              </button>
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        className="btn-gold w-full py-3"
        disabled={busy !== null || room.items.length < 1 || room.playerCount < 1}
        onClick={() => void onAct({ type: "startEvening" })}
      >
        Begin the evening
      </button>
    </div>
  );
}

function PlayDesk({
  room,
  busy,
  onAct,
  selfies,
}: {
  room: ClientRoom;
  busy: string | null;
  onAct: (action: Record<string, unknown>) => Promise<boolean>;
  selfies: Record<string, string>;
}) {
  return (
    <div className="space-y-4 text-sm">
      <p>
        Lot {(room.currentItemIndex ?? 0) + 1} of {room.items.length}
      </p>
      {room.phase === "tiebreak" && (
        <div className="space-y-2">
          <p className="text-cream/55">Break the tie</p>
          {room.tiedLeaders.map((leader) => (
            <button
              key={leader.playerId}
              type="button"
              className="btn-ghost flex w-full items-center gap-2"
              disabled={busy !== null}
              onClick={() => void onAct({ type: "breakTie", playerId: leader.playerId })}
            >
              <Face src={selfies[leader.playerId]} name={leader.nickname} size="sm" />
              Award {leader.nickname} at {money(leader.amount)}
            </button>
          ))}
        </div>
      )}
      {room.phase === "open" && (
        <button
          type="button"
          className="btn-ember w-full py-3"
          disabled={busy !== null}
          onClick={() => void onAct({ type: "awardWinner" })}
        >
          Close bidding · award
        </button>
      )}
      {room.phase === "awarded" && (
        <button
          type="button"
          className="btn-gold w-full py-3"
          disabled={busy !== null}
          onClick={() => void onAct({ type: "startNextLot" })}
        >
          {room.currentItemIndex + 1 >= room.items.length ? "Close the evening" : "Next lot"}
        </button>
      )}
      <ul className="space-y-2">
        {room.players.map((p) => (
          <li key={p.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-3 py-2">
            <span>{p.nickname}</span>
            <span className="text-gold">{money(p.balance)}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="btn-ghost w-full" onClick={() => void onAct({ type: "endSession" })}>
        End evening
      </button>
    </div>
  );
}
