"use client"

import { useEffect, useMemo, useState } from "react"
import type { FactionId, Phase } from "@/lib/game/types"
import { PHASES } from "@/lib/game/types"
import { FACTIONS, makeInitialTerrain, makeObjectives, DATASHEETS } from "@/lib/game/constants"
import dynamic from 'next/dynamic'
const PhaserGame = dynamic(() => import('@/components/PhaserGame'), { ssr: false })
import { Hud } from "@/components/hud"
import { PhaseBar } from "@/components/phase-bar"
import { UnitPanel } from "@/components/unit-panel"
import { CombatPanel } from "@/components/combat-panel"
import { BatchCombatPanel } from "@/components/batch-combat-panel"
import { BattleLog } from "@/components/battle-log"
import { StratagemMenu } from "@/components/stratagem-menu"
import { RosterBuilder } from "@/components/roster-builder"
import { DiceOverlay } from "@/components/dice-overlay"
import { useGameEngine } from "@/lib/game/useGameEngine"
import { getDistanceBetweenTokens } from "@/lib/game/utils"

const PHASE_LABEL: Record<Phase, string> = {
  "roster": "Listas",
  "deployment": "Despliegue",
  "command": "Mando",
  movement: "Movimiento",
  shooting: "Disparo",
  charge: "Carga",
  fight: "Combate"
}

export default function Page() {
  const engine = useGameEngine()
  
  const terrainLayout = engine.game.terrainLayout
  const terrain = engine.terrainState
  const objectives = useMemo(() => makeObjectives(), [])
  
  const [mobileOpen, setMobileOpen] = useState(false)
  const [stratagemsOpen, setStratagemsOpen] = useState(false)
  const [phaseModalOpen, setPhaseModalOpen] = useState(false)
  const [unitPanelExpanded, setUnitPanelExpanded] = useState(false)
  const [showMobileFloatingUnit, setShowMobileFloatingUnit] = useState(false)
  const [showMobileFloatingCombat, setShowMobileFloatingCombat] = useState(false)

  const isCombatPhase = engine.game.phase === "shooting" || engine.game.phase === "fight"

  const primarySelectedId = engine.selectedIds[0] ?? null
  const selected = engine.tokens.find((t) => t.id === primarySelectedId) ?? null
  const selectedUnit = selected ? engine.units.find(u => u.id === selected.unitId) || null : null

  let canEmbark = false
  if (selectedUnit && !selectedUnit.transportCapacity) {
    const ts = engine.tokens.filter(t => t.unitId === selectedUnit.id && t.currentWounds > 0)
    const transports = engine.units.filter(tr => tr.faction === selectedUnit.faction && tr.transportCapacity && tr.transportCapacity > 0)
    for (const tr of transports) {
      const trTokens = engine.tokens.filter(t => t.unitId === tr.id)
      if (trTokens.length > 0) {
        const trTok = trTokens[0]
        const allWithin3 = ts.length > 0 && ts.every(t => getDistanceBetweenTokens(t, trTok) <= 3)
        if (allWithin3) {
          canEmbark = true
          break
        }
      }
    }
  }
  
  const inEngagementRange = useMemo(() => {
    if (!selected) return false
    return engine.tokens.some(t => t.faction !== selected.faction && t.currentWounds > 0 && getDistanceBetweenTokens(t, selected) <= 1.0)
  }, [selected, engine.tokens])

  useEffect(() => {
    engine.setCombatTargetId(null)
    engine.setMicroMoveMode(null)
    setShowMobileFloatingCombat(false)
  }, [engine.game.phase, isCombatPhase])

  useEffect(() => {
    setShowMobileFloatingUnit(false)
  }, [primarySelectedId])

  const handleSelectUnitToDeploy = (unitId: string) => {
    const isDeploying = engine.deployingUnitId === unitId
    if (isDeploying) {
      engine.setDeployingUnitId(null)
    } else {
      engine.setDeployingUnitId(unitId)
      setMobileOpen(false) // Auto-minimize panel so user can see full 3D board
    }
  }

  const handleDeployUnit = (id: string, x: number, y: number) => {
    const rUnit = engine.rosterUnits.find((u) => u.id === id)
    const faction = rUnit?.faction || "imperium"

    const isCombatPatrol = engine.game.terrainLayout === 'combat-patrol'
    const gridWidth = isCombatPatrol ? 44 : 60

    // Enforce 10" deployment zones per Rules.md
    if (faction === "imperium" && x > 10.5) {
      alert("⚠️ ¡El Imperio debe desplegar dentro de su Zona de Despliegue! (Primeras 10\" en la izquierda del mapa)")
      return
    }
    if (faction === "chaos" && x < gridWidth - 10.5) {
      alert(`⚠️ ¡El Caos debe desplegar dentro de su Zona de Despliegue! (Últimas 10" en la derecha del mapa)`)
      return
    }

    engine.deployUnit(id, x, y)
    setMobileOpen(true) // Auto-reopen panel after unit placement
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const cmdKey = isMac ? e.metaKey : e.ctrlKey

      if (cmdKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          engine.redo()
        } else {
          engine.undo()
        }
      } else if (cmdKey && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        engine.redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [engine])

  const deploymentSidebar = (
    <div className="flex h-full flex-col p-4 bg-black/10">
      <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-primary mb-4">
        Desplegar {FACTIONS[engine.game.activePlayer].name}
      </h2>
      <div className="flex-1 overflow-y-auto space-y-3">
        {engine.rosterUnits
          .filter((r) => r.faction === engine.game.activePlayer && !r.deployed)
          .map((r) => {
            const ds = DATASHEETS.find((d) => d.id === r.datasheetId)
            const isDeploying = engine.deployingUnitId === r.id
            return (
              <button
                key={r.id}
                onClick={() => handleSelectUnitToDeploy(r.id)}
                className={`w-full text-left rounded-xl border p-3 transition-colors ${
                  isDeploying
                    ? "border-primary bg-primary/20 shadow-[0_0_10px_rgba(0,150,255,0.2)]"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <div className="font-sans text-sm font-bold">{ds?.name}</div>
                <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
                  {isDeploying ? "Haz clic en el tablero para desplegar" : "Selecciona para desplegar"}
                </div>
              </button>
            )
          })}        {engine.rosterUnits.filter((r) => r.faction === engine.game.activePlayer && !r.deployed).length === 0 && (
          <div className="text-center font-mono text-sm text-muted-foreground mt-6 space-y-3">
            <div>Todas las unidades desplegadas.</div>
            <button
              onClick={() => engine.advance(objectives)}
              className="w-full bg-primary py-3 rounded-xl font-mono text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-[0_0_15px_rgba(0,150,255,0.4)] hover:bg-primary/90 transition-all active:scale-95"
            >
              Finalizar Despliegue →
            </button>
          </div>
        )}
      </div>
    </div>
  )


  let sidebar = null
  if (engine.game.phase === "deployment") {
    sidebar = (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">{deploymentSidebar}</div>
      </div>
    )
  }

  return (
    <main className="flex h-screen w-full flex-col overflow-hidden bg-background">
      {/* Always render the 3D map — RosterBuilder floats on top as a side panel */}
      {engine.game.phase !== "roster" && (
        <Hud game={engine.game} onVp={engine.adjustVp} onCp={engine.adjustCp} />
      )}
      <div className="flex min-h-0 flex-1">
        <section className="relative min-w-0 flex-1">
          <PhaserGame
            tokens={engine.tokens}
            units={engine.units}
            terrain={terrain}
            game={engine.game}
            combatQueue={engine.combatQueue}
            deployingUnitId={engine.deployingUnitId}
            selectedIds={engine.selectedIds}
            onSelect={engine.setSelectedIds}
            onMoveTokens={engine.moveTokens} onMoveTerrain={engine.moveTerrain}
            onDeployUnit={handleDeployUnit}
            onQueueAttack={engine.queueAttack}
          />

          {/* RosterBuilder floating panel (always on top of 3D map during roster phase) */}
          {engine.game.phase === "roster" && (
            <RosterBuilder
              game={engine.game}
              roster={engine.rosterUnits}
              onUpdateRoster={engine.setRosterUnits}
              onComplete={engine.finishRoster}
              onChangePointsLimit={(limit: number) => engine.setGame(g => ({ ...g, pointsLimit: limit }))}
              onChangeTerrainLayout={(layout: string) => engine.setGame(g => ({ ...g, terrainLayout: layout }))}
            />
          )}

          {/* Floating Combat Panel */}
          {isCombatPhase && (
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
          )}

          {/* Floating Unit Panel */}
          {selected && engine.game.phase !== "roster" && (
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
                <UnitPanel token={selected} unit={selectedUnit} onWound={engine.wound} phase={engine.game.phase} onAdvance={engine.doAdvanceUnit} onFallBack={engine.doFallBackUnit} onMicroMove={engine.doMicroMove} onEmbark={engine.doEmbark} onDisembark={engine.doDisembark} microMoveMode={engine.microMoveMode} inEngagementRange={inEngagementRange} canEmbark={canEmbark} activePlayer={engine.game.activePlayer} />
              </div>
            </div>
          )}

          {/* Floating Mobile Deployment Notice when a unit is selected for placement */}
          {engine.deployingUnitId && (
            <div className="fixed top-14 left-2 right-2 sm:left-1/2 sm:-translate-x-1/2 sm:w-auto z-40 flex items-center justify-between gap-2 rounded-xl border border-primary/50 bg-slate-950/95 px-3 py-2 shadow-lg">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                <span className="font-mono text-[11px] sm:text-xs font-bold uppercase tracking-wider text-primary truncate">
                  Toca el tablero para situar la unidad
                </span>
              </div>
              <button
                onClick={() => engine.setDeployingUnitId(null)}
                className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 font-mono text-[10px] font-bold text-white uppercase shrink-0"
              >
                Cancelar ✕
              </button>
            </div>
          )}

          {engine.game.phase !== "roster" && (
            <div className="pointer-events-none absolute left-2 top-14 sm:left-4 sm:top-16 flex flex-col gap-0.5 sm:gap-1 rounded-lg border border-white/10 glass px-2.5 py-1.5 sm:px-4 sm:py-3 z-10 max-w-[200px] sm:max-w-none">
              <span className="font-mono text-[9px] sm:text-[11px] font-bold uppercase tracking-[0.15em] sm:tracking-[0.25em] text-primary truncate">
              Fase de {PHASE_LABEL[engine.game.phase] || engine.game.phase}
            </span>
            <span className="font-sans text-[10px] sm:text-[12px] text-muted-foreground/80 hidden sm:inline">
              Pinch / desliza para zoom · arrastra fondo para mover
            </span>
          </div>
          )}

        </section>

        {sidebar && engine.game.phase !== "roster" && (
          <aside className="hidden w-[380px] shrink-0 border-l border-border bg-black/40 backdrop-blur-md md:block">
            {sidebar}
          </aside>
        )}

        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 md:hidden">
            {/* Clickable Backdrop to close panel and see board */}
            <div className="flex-1 w-full" onClick={() => setMobileOpen(false)} />

            {/* Compact Floating Sheet (No blur, no heavy filters, max-h-[50vh] for high 60fps performance) */}
            <div className="relative flex flex-col max-h-[50vh] sm:max-h-[60vh] w-full rounded-t-2xl border-t border-white/20 bg-slate-950 overflow-hidden pb-safe">
              {/* Drag Handle Indicator */}
              <div className="pt-2 pb-1 flex justify-center bg-black/40 cursor-pointer" onClick={() => setMobileOpen(false)}>
                <div className="h-1.5 w-10 rounded-full bg-white/30" />
              </div>

              <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2 bg-black/40">
                <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-primary">Panel de Control</h2>
                <button 
                  onClick={() => setMobileOpen(false)} 
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 font-bold text-white text-xs"
                >
                  ✕
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-1">
                {sidebar}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* UNIFIED MOBILE TACTICAL BAR (Reset on Left, Panel on Right) */}
      <div className="fixed bottom-2 left-2 right-2 z-40 flex items-center justify-between gap-1.5 p-1.5 bg-slate-950 border border-white/20 rounded-xl shadow-md md:hidden pb-safe">
        {/* Reset Game (FAR LEFT) */}
        {engine.game.phase !== "roster" && (
          <button
            onClick={engine.reset}
            className="flex items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-2 font-mono text-xs font-bold text-red-400 shrink-0"
            title="Reiniciar Partida"
          >
            ↺
          </button>
        )}

        {/* Stratagems Toggle */}
        <button
          onClick={() => setStratagemsOpen(prev => !prev)}
          className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/20 px-2.5 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-primary shrink-0"
        >
          <span>⚡ {engine.game.cp[engine.game.activePlayer] || 0} PM</span>
        </button>

        {/* Siguiente Fase & Phase Modal Trigger (PRIMARY ACTION) */}
        {engine.game.phase !== "roster" && (
          <div className="flex-1 flex items-center gap-1 min-w-0">
            <button
              onClick={() => setPhaseModalOpen(true)}
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/10 px-2 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-white shrink-0"
              title="Ver Fases de Batalla"
            >
              <span>{PHASE_LABEL[engine.game.phase] || "Fase"} ℹ️</span>
            </button>

            <button
              onClick={() => engine.advance(objectives)}
              className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-primary px-2.5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-sm whitespace-nowrap overflow-hidden text-ellipsis"
            >
              <span>{engine.game.phase === "deployment" ? "Despliegue →" : "Siguiente →"}</span>
            </button>
          </div>
        )}

        {/* Panel Drawer Toggle (FAR RIGHT) */}
        {(sidebar || selected || isCombatPhase) && engine.game.phase !== "roster" && (
          <div className="flex gap-1 shrink-0">
            {isCombatPhase && (
              <button
                onClick={() => setShowMobileFloatingCombat(!showMobileFloatingCombat)}
                className={`flex items-center gap-1 rounded-lg border px-2.5 py-2 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  showMobileFloatingCombat
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-primary/50 bg-primary/20 text-primary animate-pulse"
                }`}
              >
                <span>⚔ Combate</span>
              </button>
            )}
            {selected && !isCombatPhase && (
              <button
                onClick={() => setShowMobileFloatingUnit(!showMobileFloatingUnit)}
                className={`flex items-center gap-1 rounded-lg border px-2.5 py-2 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  showMobileFloatingUnit
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-primary/50 bg-primary/20 text-primary animate-pulse"
                }`}
              >
                <span>📋 Ficha</span>
              </button>
            )}
            {sidebar && (
              <button
                onClick={() => setMobileOpen(true)}
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/10 px-2.5 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-foreground"
              >
                <span>📋 Panel</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* DESKTOP BOTTOM BAR (Hidden on Mobile) */}
      <div className="hidden md:flex shrink-0 items-center justify-between border-t border-white/10 bg-black/95 px-4 py-2 backdrop-blur-md z-30 gap-2">
        <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar">
          <PhaseBar phase={engine.game.phase} activePlayer={engine.game.activePlayer} />
        </div>

        {engine.game.phase !== "roster" && (
          <div className="flex items-center gap-2 shrink-0 z-30">
            <button
              onClick={() => engine.advance(objectives)}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 font-mono text-sm font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_rgba(0,150,255,0.6)] transition-all active:scale-95 whitespace-nowrap"
            >
              <span>{engine.game.phase === "deployment" ? "Finalizar Despliegue" : "Siguiente Fase"}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </button>



            <button
              onClick={engine.reset}
              className="rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2.5 font-mono text-[10px] font-bold uppercase tracking-wider text-red-400 hover:bg-red-500/20 whitespace-nowrap"
              title="Reiniciar Partida"
            >
              Reiniciar
            </button>
          </div>
        )}
      </div>
      
      <PhaseBar phase={engine.game.phase} activePlayer={engine.game.activePlayer} isOpen={phaseModalOpen} onClose={() => setPhaseModalOpen(false)} />
      <StratagemMenu game={engine.game} onUseStratagem={engine.handleUseStratagem} isOpen={stratagemsOpen} onOpenChange={setStratagemsOpen} />
      <DiceOverlay />

      {/* VICTORY MODAL POPUP */}
      {engine.game.winner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="relative w-full max-w-md rounded-2xl border border-amber-500/50 bg-slate-950 p-6 shadow-[0_0_50px_rgba(245,158,11,0.3)] text-center flex flex-col items-center gap-4">
            {/* Header Badge */}
            <div className="rounded-full bg-amber-500/20 border border-amber-400/60 px-4 py-1 font-mono text-xs font-black uppercase tracking-widest text-amber-300">
              🏆 FIN DE LA BATALLA 🏆
            </div>

            {/* Victory Title */}
            <h2 className="font-mono text-xl sm:text-2xl font-black uppercase tracking-wider text-foreground">
              {engine.game.winner === "imperium" ? "¡VICTORIA DEL IMPERIO!" : engine.game.winner === "chaos" ? "¡VICTORIA DEL CAOS!" : "¡EMPATE ESTRATÉGICO!"}
            </h2>

            {/* Reason */}
            <p className="font-sans text-sm text-muted-foreground leading-relaxed">
              {engine.game.victoryReason}
            </p>

            {/* Final VP Score Table */}
            <div className="w-full flex items-center justify-around rounded-xl border border-white/10 bg-white/5 p-3 my-2">
              <div className="flex flex-col items-center">
                <span className="font-mono text-xs font-bold text-amber-400">IMPERIO</span>
                <span className="font-mono text-2xl font-black text-white">{engine.game.vp.imperium} PV</span>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div className="flex flex-col items-center">
                <span className="font-mono text-xs font-bold text-red-400">CAOS</span>
                <span className="font-mono text-2xl font-black text-white">{engine.game.vp.chaos} PV</span>
              </div>
            </div>

            {/* Actions */}
            <button
              onClick={engine.reset}
              className="w-full rounded-xl bg-primary px-6 py-3 font-mono text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-lg hover:bg-primary/90 transition-all active:scale-95"
            >
              Iniciar Nueva Batalla ↺
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
