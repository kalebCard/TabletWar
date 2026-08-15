import React from "react"
import { Button } from "@/components/ui/button"
import { Step } from "@/components/combat/DiceRollStep"
import type { Die } from "@/lib/game/dice"
import type { Token } from "@/lib/game/types"

interface ChargePhaseProps {
  phase: string;
  targetId: string | null;
  stage: string;
  chargeTargets: { token: Token; distance: number }[];
  chargeDice: Die[];
  rollCharge: () => void;
  applyCharge: (success: boolean, distRoll: number) => void;
}

export function ChargePhase({
  phase,
  targetId,
  stage,
  chargeTargets,
  chargeDice,
  rollCharge,
  applyCharge,
}: ChargePhaseProps) {
  if (phase !== "charge" || !targetId) return null;

  return (
    <div className="mt-1 flex flex-col gap-3 border-t border-border pt-3">
      <Step
        n={1}
        title="Tirada de Carga"
        sub="Tira 2D6 para determinar la distancia de carga"
        active={stage === "setup" || stage === "charge_roll"}
        done={stage === "done"}
      >
        {stage === "setup" && (
          <Button size="sm" className="h-8 w-full bg-[oklch(0.6_0.2_25)] text-white hover:bg-[oklch(0.5_0.2_25)] font-mono text-[11px] uppercase" onClick={rollCharge}>
            Tirar 2D6
          </Button>
        )}
        {(stage === "charge_roll" || stage === "done") && chargeDice.length > 0 && (
          <>
            <div className="flex gap-2">
              {chargeDice.map(d => (
                <div key={d.id} className="flex h-8 w-8 items-center justify-center rounded bg-secondary font-mono text-sm font-bold border border-border">
                  {d.value}
                </div>
              ))}
            </div>
            {(() => {
              const rollTotal = chargeDice[0].value + chargeDice[1].value
              const cTarget = chargeTargets.find(t => t.token.id === targetId)
              if (!cTarget) return null
              const needed = Math.max(0, cTarget.distance - 1)
              const success = rollTotal >= needed
              return (
                <div className="flex flex-col gap-2 mt-2">
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="uppercase tracking-wider text-muted-foreground">Resultado</span>
                    <span className="text-foreground font-bold">{rollTotal}"</span>
                  </div>
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="uppercase tracking-wider text-muted-foreground">Necesario (Objetivo - 1")</span>
                    <span className="text-foreground">{needed.toFixed(1)}"</span>
                  </div>
                  <div className={`rounded border px-2 py-1.5 text-center font-mono text-[11px] uppercase tracking-wider ${success ? 'bg-[oklch(0.5_0.15_150)]/20 text-[oklch(0.8_0.15_150)] border-[oklch(0.8_0.15_150)]' : 'bg-destructive/20 text-destructive border-destructive'}`}>
                    {success ? "Carga Exitosa" : "Carga Fallida"}
                  </div>
                  {stage === "charge_roll" && (
                    <Button
                      size="sm"
                      className="h-8 w-full font-mono text-[11px] uppercase mt-1"
                      onClick={() => applyCharge(success, rollTotal)}
                    >
                      Confirmar
                    </Button>
                  )}
                </div>
              )
            })()}
          </>
        )}
      </Step>
    </div>
  )
}
