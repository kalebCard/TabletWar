"use client"

import { useState } from "react"
import type { GameState } from "@/lib/game/types"
import { FACTIONS } from "@/lib/game/constants"

interface Props {
  game: GameState
  onUseStratagem: (faction: string, cost: number, stratName: string) => void
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

const STRATAGEMS = [
  { name: "Repetición de Mando", cost: 1, phase: "any", effect: "Repite una sola tirada para impactar, herir, daño o salvación." },
  { name: "Contraofensiva", cost: 2, phase: "fight", effect: "Lucha con una unidad elegible antes que la siguiente unidad del jugador atacante." },
  { name: "Cuerpo a Tierra", cost: 1, phase: "shooting", effect: "La unidad obtiene una salvación invulnerable de 6+ y el beneficio de Cobertura." },
  { name: "Granada", cost: 1, phase: "shooting", effect: 'Selecciona una unidad enemiga a 8". Tira 6 D6; por cada 4+, sufre 1 Herida Mortal.' },
  { name: "Fuego Defensivo", cost: 1, phase: "movement", effect: "Dispara con una unidad como si fuera tu fase de Disparo." },
]

const PHASE_NAMES: Record<string, string> = {
  any: "Cualquier fase",
  movement: "Fase de Movimiento",
  shooting: "Fase de Disparo",
  charge: "Fase de Carga",
  fight: "Fase de Combate",
  command: "Fase de Mando",
}

export function StratagemMenu({ game, onUseStratagem, isOpen, onOpenChange }: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = isOpen !== undefined
  const open = isControlled ? isOpen : internalOpen
  const setOpen = (val: boolean) => {
    if (isControlled) onOpenChange?.(val)
    else setInternalOpen(val)
  }
  
  const currentCp = game.cp[game.activePlayer] || 0
  const fac = FACTIONS[game.activePlayer]

  if (!open) {
    if (isControlled) return null // Handled by unified bar trigger
    return (
      <button 
        onClick={() => setOpen(true)}
        className="fixed left-3 bottom-20 sm:left-6 sm:bottom-20 z-40 rounded-xl border border-white/10 glass px-4 py-2.5 sm:px-6 sm:py-3 font-mono text-[11px] sm:text-[12px] font-bold uppercase tracking-widest shadow-lg transition-transform hover:scale-105 active:scale-95 hidden sm:block"
        style={{ background: `linear-gradient(135deg, ${fac.colorSoft}, oklch(0.1 0 0 / 0.8))`, color: fac.color }}
      >
        Estratagemas ({currentCp} PM)
      </button>
    )
  }

  return (
    <div className="fixed left-2 right-2 bottom-14 sm:left-6 sm:right-auto sm:bottom-20 z-50 sm:w-80 rounded-xl border border-white/20 bg-slate-950 shadow-lg flex flex-col max-h-[50vh] sm:max-h-[60vh] overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-black/20" style={{ borderBottomColor: fac.color, borderBottomWidth: 2 }}>
        <span className="font-mono text-[12px] font-bold uppercase tracking-widest text-foreground drop-shadow-sm">
          Estratagemas ({fac.name})
        </span>
        <div className="flex items-center gap-3">
          <span className="font-sans text-[13px] font-black tabular-nums bg-white/10 text-primary px-2.5 py-1 rounded-md shadow-inner border border-white/5">
            {currentCp} PM
          </span>
          <button
            onClick={() => setOpen(false)}
            className="rounded-md font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground hover:bg-white/10 px-2 py-1"
          >
            Cerrar
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 bg-black/10">
        {STRATAGEMS.map(strat => {
          const canAfford = currentCp >= strat.cost
          const isPhase = strat.phase === "any" || strat.phase === game.phase
          return (
            <div 
              key={strat.name} 
              className={`rounded-xl border p-3 flex flex-col gap-1.5 transition-all duration-300 ${(!canAfford || !isPhase) ? 'opacity-40 border-white/5 bg-transparent' : 'border-white/10 bg-white/5 shadow-inner hover:bg-white/10'}`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-sans text-sm font-bold ${canAfford && isPhase ? 'text-foreground' : 'text-muted-foreground'}`}>{strat.name}</span>
                <span className="font-sans text-[12px] font-black text-primary">{strat.cost} PM</span>
              </div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{PHASE_NAMES[strat.phase]}</span>
              <p className="text-[13px] text-muted-foreground/90 leading-relaxed font-sans">{strat.effect}</p>
              
              <div className="mt-2 flex justify-end">
                <button
                  disabled={!canAfford}
                  onClick={() => onUseStratagem(game.activePlayer, strat.cost, strat.name)}
                  className={`px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-widest rounded-lg border transition-all ${canAfford ? 'border-primary/50 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground shadow-[0_0_10px_rgba(0,150,255,0.1)]' : 'border-white/10 text-muted-foreground/50 cursor-not-allowed'}`}
                >
                  Usar Estratagema
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
