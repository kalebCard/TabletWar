"use client"

import { useEffect, useMemo } from "react"
import { useGameStore } from "@/lib/store/gameStore"
import { useUIStore } from "@/lib/store/uiStore"
import type { Phase } from "@/lib/game/types"
import { PHASES, PHASE_LABEL } from "@/lib/game/types"
import { makeObjectives } from "@/lib/game/constants"
import dynamic from 'next/dynamic'
import type { PhaserGameProps } from '@/components/PhaserGame'
const PhaserGame = dynamic<PhaserGameProps>(() => import('@/components/PhaserGame'), { ssr: false })
import { Hud } from "@/components/hud"
import { PhaseBar } from "@/components/phase-bar"
import { CombatOverlay } from "@/components/ui/overlays/combat-overlay"
import { UnitOverlay } from "@/components/ui/overlays/unit-overlay"
import { StratagemMenu } from "@/components/stratagem-menu"
import { RosterBuilder } from "@/components/roster-builder"
import { DiceOverlay } from "@/components/dice-overlay"
import { useGameActions } from "@/lib/game/useGameActions"
import { useDeploymentLogic } from "@/lib/game/hooks/useDeploymentLogic"
import { isValidDeploymentPosition } from "@/lib/game/rules"

import { DeploymentSidebar } from "@/components/ui/deployment-sidebar"
import { VictoryModal } from "@/components/ui/victory-modal"
import { MobileTacticalBar } from "@/components/ui/mobile-tactical-bar"
import { DesktopActionBar } from "@/components/ui/desktop-action-bar"
import { KeyboardShortcuts } from "@/components/ui/keyboard-shortcuts"

export default function Page() {
  const actions = useGameActions()
  const engine = actions; // For compatibility with components expecting engine props
  
  const game = useGameStore(s => s.game)
  const rosterUnits = useGameStore(s => s.rosterUnits)
  const tokens = useGameStore(s => s.tokens)
  const terrainState = useGameStore(s => s.terrainState)
  
  const selectedIds = useUIStore(s => s.selectedIds)
  const deployingUnitId = useUIStore(s => s.deployingUnitId)
  
  const terrainLayout = game.terrainLayout
  const terrain = terrainState
  const objectives = useMemo(() => makeObjectives(), [])
  
  const isMobileOpen = useUIStore(s => s.isMobileOpen)
  const isStratagemsOpen = useUIStore(s => s.isStratagemsOpen)
  const isPhaseModalOpen = useUIStore(s => s.isPhaseModalOpen)
  const isMobileFloatingUnitOpen = useUIStore(s => s.isMobileFloatingUnitOpen)
  const isMobileFloatingCombatOpen = useUIStore(s => s.isMobileFloatingCombatOpen)
  const setUIState = useUIStore(s => s.setUIState)

  const isCombatPhase = game.phase === "shooting" || game.phase === "fight"

  const primarySelectedId = selectedIds[0] ?? null
  const selected = tokens.find((t) => t.id === primarySelectedId) ?? null

  useEffect(() => {
    actions.setCombatTargetId(null)
    actions.setMicroMoveMode(null)
    setUIState({ isMobileFloatingCombatOpen: false })
  }, [game.phase, isCombatPhase])

  useEffect(() => {
    setUIState({ isMobileFloatingUnitOpen: false })
  }, [primarySelectedId])

  const { handleSelectUnitToDeploy, handleDeployUnit } = useDeploymentLogic({ 
    rosterUnits, deployUnit: actions.deployUnit, setDeployingUnitId: actions.setDeployingUnitId 
  });

  const sidebar = game.phase === "deployment" ? (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <DeploymentSidebar 
          game={game} 
          rosterUnits={rosterUnits} 
          deployingUnitId={deployingUnitId} 
          onSelectUnit={handleSelectUnitToDeploy} 
          onFinish={() => actions.advance(objectives)} 
        />
      </div>
    </div>
  ) : null;

  return (
    <main className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <KeyboardShortcuts onUndo={engine.undo} onRedo={engine.redo} />
      {/* Always render the 3D map — RosterBuilder floats on top as a side panel */}
      {game.phase !== "roster" && (
        <Hud game={game} onVp={actions.adjustVp} onCp={actions.adjustCp} />
      )}
      <div className="flex min-h-0 flex-1">
        <section className="relative min-w-0 flex-1">
          <PhaserGame
            onSelect={actions.setSelectedIds}
            onMoveTokens={actions.moveTokens} onMoveTerrain={actions.moveTerrain}
            onDeployUnit={handleDeployUnit}
            onQueueAttack={actions.queueAttack}
          />

          {/* RosterBuilder floating panel (always on top of 3D map during roster phase) */}
          {game.phase === "roster" && (
            <RosterBuilder
              game={game}
              roster={rosterUnits}
              onUpdateRoster={actions.setRosterUnits}
              onComplete={actions.finishRoster}
              onChangePointsLimit={(limit: number) => actions.setGame((g: any) => ({ ...g, pointsLimit: limit }))}
              onChangeTerrainLayout={(layout: string) => actions.setGame((g: any) => ({ ...g, terrainLayout: layout }))}
            />
          )}

          {/* Floating Combat Panel */}
          <CombatOverlay 
            engine={engine} 
            isCombatPhase={isCombatPhase} 
            showMobileFloatingCombat={isMobileFloatingCombatOpen} 
            terrain={terrain} 
          />

          {/* Floating Unit Panel */}
          <UnitOverlay 
            engine={engine} 
            selected={selected} 
            showMobileFloatingUnit={isMobileFloatingUnitOpen} 
          />

          {/* Floating Mobile Deployment Notice when a unit is selected for placement */}
          {deployingUnitId && (
            <div className="fixed top-14 left-2 right-2 sm:left-1/2 sm:-translate-x-1/2 sm:w-auto z-40 flex items-center justify-between gap-2 rounded-xl border border-primary/50 bg-slate-950/95 px-3 py-2 shadow-lg">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                <span className="font-mono text-[11px] sm:text-xs font-bold uppercase tracking-wider text-primary truncate">
                  Toca el tablero para situar la unidad
                </span>
              </div>
              <button
                onClick={() => actions.setDeployingUnitId(null)}
                className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 font-mono text-[10px] font-bold text-white uppercase shrink-0"
              >
                Cancelar ✕
              </button>
            </div>
          )}

          {game.phase !== "roster" && (
            <div className="pointer-events-none absolute left-2 top-14 sm:left-4 sm:top-16 flex flex-col gap-0.5 sm:gap-1 rounded-lg border border-white/10 glass px-2.5 py-1.5 sm:px-4 sm:py-3 z-10 max-w-[200px] sm:max-w-none">
              <span className="font-mono text-[9px] sm:text-[11px] font-bold uppercase tracking-[0.15em] sm:tracking-[0.25em] text-primary truncate">
              Fase de {PHASE_LABEL[game.phase] || game.phase}
            </span>
            <span className="font-sans text-[10px] sm:text-[12px] text-muted-foreground/80 hidden sm:inline">
              Pinch / desliza para zoom · arrastra fondo para mover
            </span>
          </div>
          )}

        </section>

        {sidebar && game.phase !== "roster" && (
          <aside className="hidden w-[380px] shrink-0 border-l border-border bg-black/40 backdrop-blur-md md:block">
            {sidebar}
          </aside>
        )}

        {isMobileOpen && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 md:hidden">
            {/* Clickable Backdrop to close panel and see board */}
            <div className="flex-1 w-full" onClick={() => setUIState({ isMobileOpen: false })} />

            {/* Compact Floating Sheet */}
            <div className="relative flex flex-col max-h-[50vh] sm:max-h-[60vh] w-full rounded-t-2xl border-t border-white/20 bg-slate-950 overflow-hidden pb-safe">
              <div className="pt-2 pb-1 flex justify-center bg-black/40 cursor-pointer" onClick={() => setUIState({ isMobileOpen: false })}>
                <div className="h-1.5 w-10 rounded-full bg-white/30" />
              </div>

              <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2 bg-black/40">
                <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-primary">Panel de Control</h2>
                <button 
                  onClick={() => setUIState({ isMobileOpen: false })} 
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

      <MobileTacticalBar 
        phase={game.phase} 
        cp={game.cp[game.activePlayer] || 0} 
        isCombatPhase={isCombatPhase} 
        hasSelectedUnit={!!selected} 
        hasSidebar={!!sidebar} 
        showMobileFloatingCombat={isMobileFloatingCombatOpen} 
        showMobileFloatingUnit={isMobileFloatingUnitOpen} 
        onReset={actions.reset} 
        onToggleStratagems={() => setUIState({ isStratagemsOpen: !isStratagemsOpen })} 
        onOpenPhaseModal={() => setUIState({ isPhaseModalOpen: true })} 
        onAdvance={() => actions.advance(objectives)} 
        onToggleCombatPanel={() => setUIState({ isMobileFloatingCombatOpen: !isMobileFloatingCombatOpen })} 
        onToggleUnitPanel={() => setUIState({ isMobileFloatingUnitOpen: !isMobileFloatingUnitOpen })} 
        onOpenSidebar={() => setUIState({ isMobileOpen: true })} 
      />

      <DesktopActionBar 
        phase={game.phase} 
        activePlayer={game.activePlayer} 
        onAdvance={() => actions.advance(objectives)} 
        onReset={actions.reset} 
      />
      
      <PhaseBar phase={game.phase} activePlayer={game.activePlayer} isOpen={isPhaseModalOpen} onClose={() => setUIState({ isPhaseModalOpen: false })} />
      <StratagemMenu game={game} onUseStratagem={actions.handleUseStratagem} isOpen={isStratagemsOpen} onOpenChange={(open) => setUIState({ isStratagemsOpen: open })} />
      <DiceOverlay />

      <VictoryModal 
        winner={game.winner} 
        victoryReason={game.victoryReason} 
        vp={game.vp} 
        onRestart={actions.reset} 
      />
    </main>
  )
}
