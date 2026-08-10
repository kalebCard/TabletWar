"use client"

import type { Phase, FactionId } from "@/lib/game/types"
import { PHASES } from "@/lib/game/types"
import { FACTIONS } from "@/lib/game/constants"

const PHASE_LABEL: Record<Phase, string> = {
  roster: "Roster",
  deployment: "Despliegue",
  command: "Mando",
  movement: "Movimiento",
  shooting: "Disparo",
  charge: "Carga",
  fight: "Combate"
}

interface Props {
  phase: Phase
  activePlayer: FactionId
  isOpen?: boolean
  onClose?: () => void
  onSelectPhase?: (phase: Phase) => void
}

export function PhaseBar({ phase, activePlayer, isOpen, onClose, onSelectPhase }: Props) {
  const fac = FACTIONS[activePlayer]

  if (isOpen !== undefined) {
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
        <div className="flex-1 w-full max-w-sm rounded-2xl border border-white/20 bg-slate-950 p-4 shadow-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: fac.color }} />
              <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-primary">
                Fases de Batalla ({fac.name})
              </h2>
            </div>
            <button 
              onClick={onClose} 
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 font-bold text-white text-xs"
            >
              ✕
            </button>
          </div>

          <div className="grid gap-1.5 max-h-[55vh] overflow-y-auto">
            {PHASES.map((p, idx) => {
              const active = p === phase
              return (
                <div
                  key={p}
                  onClick={() => {
                    onSelectPhase?.(p)
                    onClose?.()
                  }}
                  className={`flex items-center justify-between rounded-xl border p-2.5 font-mono text-xs font-bold uppercase tracking-wider transition-all text-left ${
                    active
                      ? "border-primary bg-primary/20 text-primary-foreground"
                      : "border-white/10 bg-white/5 text-muted-foreground"
                  }`}
                >
                  <span>{idx + 1}. {PHASE_LABEL[p]}</span>
                  {active && <span className="rounded bg-primary px-2 py-0.5 text-[9px] font-black text-primary-foreground">ACTIVA</span>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center w-full max-w-full overflow-x-auto no-scrollbar py-1">
      <div className="flex items-center shrink-0 rounded-lg border border-white/10 shadow-inner bg-black/20 overflow-hidden">
        {PHASES.map((p) => {
          const active = p === phase
          return (
            <div
              key={p}
              className={`border-r border-white/10 px-2.5 py-1.5 sm:px-4 sm:py-2 font-mono text-[10px] sm:text-[12px] font-bold uppercase tracking-wider sm:tracking-widest whitespace-nowrap last:border-r-0 transition-all duration-300 ${active ? 'shadow-[0_0_15px_rgba(255,255,255,0.2)]' : ''}`}
              style={
                active
                  ? { backgroundColor: fac.color, color: "oklch(0.98 0 0)" }
                  : { color: "var(--muted-foreground)" }
              }
            >
              {PHASE_LABEL[p]}
            </div>
          )
        })}
      </div>
    </div>
  )
}

