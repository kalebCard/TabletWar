"use client"

import { BatchCombatPanel } from "@/components/batch-combat-panel"

interface CombatOverlayProps {
  engine: any
  isCombatPhase: boolean
  showMobileFloatingCombat: boolean
  terrain: any[]
}

export function CombatOverlay({ engine, isCombatPhase, showMobileFloatingCombat, terrain }: CombatOverlayProps) {
  if (!isCombatPhase) return null;

  return (
    <div className={`absolute top-[45vh] sm:top-32 right-2 sm:right-4 z-40 w-[280px] sm:w-full sm:max-w-[400px] max-h-[40vh] sm:max-h-[70vh] shadow-2xl rounded-xl overflow-hidden border border-white/20 bg-slate-950/95 backdrop-blur-md flex-col pointer-events-auto ${!showMobileFloatingCombat ? 'hidden md:flex' : 'flex'}`}>
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-white/10 bg-black/40">
        <span className="font-mono text-[10px] font-bold text-primary uppercase tracking-widest">Resolución de Combate</span>
        <button onClick={() => engine.setCombatQueue([])} className="text-white/60 hover:text-white transition-colors text-xs font-bold w-6 h-6 rounded-full bg-white/5 hover:bg-white/20 flex items-center justify-center md:hidden">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <BatchCombatPanel
          tokens={engine.tokens}
          units={engine.units}
          terrain={terrain}
          phase={engine.game.phase}
          queue={engine.combatQueue}
          onUpdateWeapon={engine.updateQueuedAttackWeapon}
          onRemoveFromQueue={engine.removeAttack}
          onResolveBatch={engine.resolveBatchAttacks}
          onCancel={() => engine.setCombatQueue([])}
        />
      </div>
    </div>
  )
}
