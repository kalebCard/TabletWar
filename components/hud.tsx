"use client"

import type { FactionId, GameState } from "@/lib/game/types"
import { FACTIONS } from "@/lib/game/constants"

interface Props {
  game: GameState
  onVp: (f: FactionId, d: number) => void
  onCp: (f: FactionId, d: number) => void
}

export function Hud({ game, onVp, onCp }: Props) {
  return (
    <header className="fixed top-2 left-1.5 right-1.5 sm:left-1/2 sm:-translate-x-1/2 sm:w-auto z-40 flex items-center justify-between sm:justify-center gap-1 sm:gap-6 bg-slate-950/95 border border-white/20 rounded-xl shadow-md px-1.5 py-1 sm:px-6 sm:py-2 max-w-[calc(100vw-12px)]">
      <CompactFactionScore faction="imperium" game={game} onVp={onVp} onCp={onCp} align="left" />

      {/* Round Indicator */}
      <div className="flex flex-col items-center justify-center shrink-0 px-1 sm:px-2 border-x border-white/10">
        <span className="font-mono text-[8px] sm:text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
          Ronda
        </span>
        <span className="font-mono text-xs sm:text-base font-black text-foreground">
          {game.round}<span className="text-[9px] sm:text-[10px] text-muted-foreground font-normal">/5</span>
        </span>
      </div>

      <CompactFactionScore faction="chaos" game={game} onVp={onVp} onCp={onCp} align="right" />
    </header>
  )
}

function CompactFactionScore({
  faction,
  game,
  onVp,
  onCp,
  align,
}: {
  faction: FactionId
  game: GameState
  onVp: (f: FactionId, d: number) => void
  onCp: (f: FactionId, d: number) => void
  align: "left" | "right"
}) {
  const fac = FACTIONS[faction]
  const active = game.activePlayer === faction

  return (
    <div className={`flex items-center gap-1 sm:gap-3 shrink-0 ${align === "right" ? "flex-row-reverse" : ""}`}>
      {/* Faction Name Badge */}
      <div
        className={`flex items-center gap-1 rounded-md sm:rounded-lg px-1.5 py-0.5 sm:px-2 sm:py-1 font-mono text-[9px] sm:text-xs font-black uppercase tracking-wider shrink-0 ${
          active ? "border border-white/40" : "opacity-75"
        }`}
        style={{
          background: active ? `linear-gradient(135deg, ${fac.colorSoft}, ${fac.color})` : "rgba(255,255,255,0.08)",
          color: active ? "oklch(0.98 0 0)" : fac.color,
        }}
      >
        <span className="sm:hidden">{faction === "imperium" ? "IMP" : "CHS"}</span>
        <span className="hidden sm:inline">{faction === "imperium" ? "IMPERIUM" : "CHAOS"}</span>
        {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </div>

      {/* PV & PM Stats */}
      <div className="flex items-center gap-1 sm:gap-2 font-mono text-[10px] sm:text-xs font-bold shrink-0">
        {/* PV */}
        <div className="flex items-center gap-0.5 bg-black/40 border border-white/10 rounded-md px-1 py-0.5">
          <button onClick={() => onVp(faction, -1)} className="text-muted-foreground hover:text-white px-0.5 text-[10px] active:scale-95">&minus;</button>
          <span className="text-foreground tabular-nums font-extrabold">{game.vp[faction]}</span>
          <span className="text-[8px] sm:text-[9px] text-muted-foreground">PV</span>
          <button onClick={() => onVp(faction, 1)} className="text-muted-foreground hover:text-white px-0.5 text-[10px] active:scale-95">+</button>
        </div>

        {/* PM */}
        <div className="flex items-center gap-0.5 bg-black/40 border border-white/10 rounded-md px-1 py-0.5">
          <button onClick={() => onCp(faction, -1)} className="text-muted-foreground hover:text-white px-0.5 text-[10px] active:scale-95">&minus;</button>
          <span className="text-primary tabular-nums font-extrabold">{game.cp[faction]}</span>
          <span className="text-[8px] sm:text-[9px] text-muted-foreground">PM</span>
          <button onClick={() => onCp(faction, 1)} className="text-muted-foreground hover:text-white px-0.5 text-[10px] active:scale-95">+</button>
        </div>
      </div>
    </div>
  )
}
