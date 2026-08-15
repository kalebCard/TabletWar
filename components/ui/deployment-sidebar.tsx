import React from "react";
import { FACTIONS, DATASHEETS } from "@/lib/game/constants";

interface Props {
  game: any;
  rosterUnits: any[];
  deployingUnitId: string | null;
  onSelectUnit: (id: string) => void;
  onFinish: () => void;
}

export function DeploymentSidebar({ game, rosterUnits, deployingUnitId, onSelectUnit, onFinish }: Props) {
  return (
    <div className="flex h-full flex-col p-4 bg-black/10">
      <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-primary mb-4">
        Desplegar {FACTIONS[game.activePlayer as keyof typeof FACTIONS]?.name}
      </h2>
      <div className="flex-1 overflow-y-auto space-y-3">
        {rosterUnits
          .filter((r) => r.faction === game.activePlayer && !r.deployed)
          .map((r) => {
            const ds = DATASHEETS.find((d) => d.id === r.datasheetId);
            const isDeploying = deployingUnitId === r.id;
            return (
              <button
                key={r.id}
                onClick={() => onSelectUnit(r.id)}
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
            );
          })}
        {rosterUnits.filter((r) => r.faction === game.activePlayer && !r.deployed).length === 0 && (
          <div className="text-center font-mono text-sm text-muted-foreground mt-6 space-y-3">
            <div>Todas las unidades desplegadas.</div>
            <button
              onClick={onFinish}
              className="w-full bg-primary py-3 rounded-xl font-mono text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-[0_0_15px_rgba(0,150,255,0.4)] hover:bg-primary/90 transition-all active:scale-95"
            >
              Finalizar Despliegue →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
