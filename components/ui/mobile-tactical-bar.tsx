import React from "react";
import { Phase, PHASE_LABEL } from "@/lib/game/types";

interface Props {
  phase: Phase;
  cp: number;
  isCombatPhase: boolean;
  hasSelectedUnit: boolean;
  hasSidebar: boolean;
  showMobileFloatingCombat: boolean;
  showMobileFloatingUnit: boolean;
  onReset: () => void;
  onToggleStratagems: () => void;
  onOpenPhaseModal: () => void;
  onAdvance: () => void;
  onToggleCombatPanel: () => void;
  onToggleUnitPanel: () => void;
  onOpenSidebar: () => void;
}

export function MobileTacticalBar({
  phase, cp, isCombatPhase, hasSelectedUnit, hasSidebar,
  showMobileFloatingCombat, showMobileFloatingUnit,
  onReset, onToggleStratagems, onOpenPhaseModal, onAdvance,
  onToggleCombatPanel, onToggleUnitPanel, onOpenSidebar
}: Props) {
  if (phase === "roster") return null;

  return (
    <div className="fixed bottom-2 left-2 right-2 z-40 flex items-center justify-between gap-1.5 p-1.5 bg-slate-950 border border-white/20 rounded-xl shadow-md md:hidden pb-safe">
      <button
        onClick={onReset}
        className="flex items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-2 font-mono text-xs font-bold text-red-400 shrink-0"
        title="Reiniciar Partida"
      >
        ↺
      </button>

      <button
        onClick={onToggleStratagems}
        className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/20 px-2.5 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-primary shrink-0"
      >
        <span>⚡ {cp} PM</span>
      </button>

      <div className="flex-1 flex items-center gap-1 min-w-0">
        <button
          onClick={onOpenPhaseModal}
          className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/10 px-2 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-white shrink-0"
          title="Ver Fases de Batalla"
        >
          <span>{PHASE_LABEL[phase] || "Fase"} ℹ️</span>
        </button>

        <button
          onClick={onAdvance}
          className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-primary px-2.5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-sm whitespace-nowrap overflow-hidden text-ellipsis"
        >
          <span>{phase === "deployment" ? "Despliegue →" : "Siguiente →"}</span>
        </button>
      </div>

      {(hasSidebar || hasSelectedUnit || isCombatPhase) && (
        <div className="flex gap-1 shrink-0">
          {isCombatPhase && (
            <button
              onClick={onToggleCombatPanel}
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-2 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
                showMobileFloatingCombat
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-primary/50 bg-primary/20 text-primary animate-pulse"
              }`}
            >
              <span>⚔ Combate</span>
            </button>
          )}
          {hasSelectedUnit && !isCombatPhase && (
            <button
              onClick={onToggleUnitPanel}
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-2 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
                showMobileFloatingUnit
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-primary/50 bg-primary/20 text-primary animate-pulse"
              }`}
            >
              <span>📋 Ficha</span>
            </button>
          )}
          {hasSidebar && (
            <button
              onClick={onOpenSidebar}
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/10 px-2.5 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-foreground"
            >
              <span>📋 Panel</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
