import React from "react";

interface Props {
  winner: string | null | undefined;
  victoryReason?: string;
  vp: { imperium: number; chaos: number };
  onRestart: () => void;
}

export function VictoryModal({ winner, victoryReason, vp, onRestart }: Props) {
  if (!winner) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-md rounded-2xl border border-amber-500/50 bg-slate-950 p-6 shadow-[0_0_50px_rgba(245,158,11,0.3)] text-center flex flex-col items-center gap-4">
        {/* Header Badge */}
        <div className="rounded-full bg-amber-500/20 border border-amber-400/60 px-4 py-1 font-mono text-xs font-black uppercase tracking-widest text-amber-300">
          🏆 FIN DE LA BATALLA 🏆
        </div>

        {/* Victory Title */}
        <h2 className="font-mono text-xl sm:text-2xl font-black uppercase tracking-wider text-foreground">
          {winner === "imperium" ? "¡VICTORIA DEL IMPERIO!" : winner === "chaos" ? "¡VICTORIA DEL CAOS!" : "¡EMPATE ESTRATÉGICO!"}
        </h2>

        {/* Reason */}
        <p className="font-sans text-sm text-muted-foreground leading-relaxed">
          {victoryReason}
        </p>

        {/* Final VP Score Table */}
        <div className="w-full flex items-center justify-around rounded-xl border border-white/10 bg-white/5 p-3 my-2">
          <div className="flex flex-col items-center">
            <span className="font-mono text-xs font-bold text-amber-400">IMPERIO</span>
            <span className="font-mono text-2xl font-black text-white">{vp.imperium} PV</span>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div className="flex flex-col items-center">
            <span className="font-mono text-xs font-bold text-red-400">CAOS</span>
            <span className="font-mono text-2xl font-black text-white">{vp.chaos} PV</span>
          </div>
        </div>

        {/* Actions */}
        <button
          onClick={onRestart}
          className="w-full rounded-xl bg-primary px-6 py-3 font-mono text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-lg hover:bg-primary/90 transition-all active:scale-95"
        >
          Iniciar Nueva Batalla ↺
        </button>
      </div>
    </div>
  );
}
