"use client"

import { useState, useMemo } from "react"
import { UnitPanel } from "@/components/unit-panel"
import { canUnitEmbark, isUnitInEngagementRange } from "@/lib/game/rules"
import type { Token } from "@/lib/game/types"

interface UnitOverlayProps {
  engine: any // We use any for engine here to avoid importing the massive return type of useGameEngine, though type safety is preferred in a real project
  selected: Token | null
  showMobileFloatingUnit: boolean
}

export function UnitOverlay({ engine, selected, showMobileFloatingUnit }: UnitOverlayProps) {
  const [unitPanelExpanded, setUnitPanelExpanded] = useState(false)

  const selectedUnit = selected ? engine.units.find((u: any) => u.id === selected.unitId) || null : null
  const canEmbark = selectedUnit ? canUnitEmbark(selectedUnit, engine.tokens, engine.units) : false
  
  const inEngagementRange = useMemo(() => {
    return selected ? isUnitInEngagementRange(selected, engine.tokens) : false
  }, [selected, engine.tokens])

  if (!selected || engine.game.phase === "roster") return null;

  return (
    <div className={`absolute top-24 sm:top-32 left-2 sm:left-4 z-40 w-[280px] sm:w-full sm:max-w-[400px] ${unitPanelExpanded ? 'max-h-[60vh]' : 'max-h-fit'} sm:max-h-[70vh] shadow-2xl rounded-xl overflow-hidden border border-white/20 bg-slate-950/95 backdrop-blur-md flex-col pointer-events-auto transition-all duration-300 ${!showMobileFloatingUnit ? 'hidden md:flex' : 'flex'}`}>
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-white/10 bg-black/40">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-bold text-primary uppercase tracking-widest">Ficha</span>
          <button onClick={() => setUnitPanelExpanded(!unitPanelExpanded)} className="md:hidden text-primary border border-primary/50 bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded text-[9px] font-bold uppercase">
            {unitPanelExpanded ? "Ocultar" : "Ver"}
          </button>
        </div>
        <button onClick={() => engine.setSelectedIds([])} className="text-white/60 hover:text-white transition-colors text-xs font-bold w-6 h-6 rounded-full bg-white/5 hover:bg-white/20 flex items-center justify-center">✕</button>
      </div>
      <div className={`flex-1 overflow-y-auto custom-scrollbar ${!unitPanelExpanded ? 'hidden md:block' : ''}`}>
        <UnitPanel 
          token={selected} 
          unit={selectedUnit} 
          onWound={engine.wound} 
          phase={engine.game.phase} 
          onAdvance={engine.doAdvanceUnit} 
          onFallBack={engine.doFallBackUnit} 
          onMicroMove={engine.doMicroMove} 
          onEmbark={engine.doEmbark} 
          onDisembark={engine.doDisembark} 
          microMoveMode={engine.microMoveMode} 
          inEngagementRange={inEngagementRange} 
          canEmbark={canEmbark} 
          activePlayer={engine.game.activePlayer} 
        />
      </div>
    </div>
  )
}
