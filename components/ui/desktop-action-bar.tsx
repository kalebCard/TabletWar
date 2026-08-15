import React from "react";
import { PhaseBar } from "@/components/phase-bar";
import { Phase, FactionId } from "@/lib/game/types";

interface Props {
  phase: Phase;
  activePlayer: FactionId;
  onAdvance: () => void;
  onReset: () => void;
}

export function DesktopActionBar({ phase, activePlayer, onAdvance, onReset }: Props) {
  if (phase === "roster") return null;

  return (
    <div className="hidden md:flex shrink-0 items-center justify-between border-t border-white/10 bg-black/95 px-4 py-2 backdrop-blur-md z-30 gap-2">
      <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar">
        <PhaseBar phase={phase} activePlayer={activePlayer} />
      </div>

      <div className="flex items-center gap-2 shrink-0 z-30">
        <button
          onClick={onAdvance}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 font-mono text-sm font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_rgba(0,150,255,0.6)] transition-all active:scale-95 whitespace-nowrap"
        >
          <span>{phase === "deployment" ? "Finalizar Despliegue" : "Siguiente Fase"}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </button>

        <button
          onClick={onReset}
          className="rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2.5 font-mono text-[10px] font-bold uppercase tracking-wider text-red-400 hover:bg-red-500/20 whitespace-nowrap"
          title="Reiniciar Partida"
        >
          Reiniciar
        </button>
      </div>
    </div>
  );
}
