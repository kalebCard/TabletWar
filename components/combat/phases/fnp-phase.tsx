import React from "react"
import { Button } from "@/components/ui/button"
import { Step, DiceGrid, Result } from "@/components/combat/DiceRollStep"
import type { Die } from "@/lib/game/dice"

interface FnpPhaseProps {
  fnpStage: boolean;
  stage: string;
  hasFnp: boolean;
  fnpTgt: number | null;
  fnpDice: Die[];
  ignoredDamage: number;
  totalDamageBeforeFnp: number;
  finalDamage: number;
  apply: () => void;
}

export function FnpPhase({
  fnpStage,
  stage,
  hasFnp,
  fnpTgt,
  fnpDice,
  ignoredDamage,
  totalDamageBeforeFnp,
  finalDamage,
  apply,
}: FnpPhaseProps) {
  if (!((fnpStage || stage === "done") && hasFnp)) return null;

  return (
    <Step
      n={4}
      title="No hay dolor (FNP)"
      sub={`FNP ${fnpTgt}+`}
      active={fnpStage && stage !== "done"}
      done={stage === "done"}
    >
      <DiceGrid dice={fnpDice} target={fnpTgt ?? 7} />
      <Result label="Ignoradas" value={ignoredDamage} of={totalDamageBeforeFnp} />
      <div className="mt-1 flex items-center justify-between rounded-md bg-destructive/15 px-2.5 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-destructive">Daño Final</span>
        <span className="font-mono text-sm font-bold tabular-nums text-destructive">
          {finalDamage}
        </span>
      </div>
      {fnpStage && stage !== "done" && (
        <>
          <Button
            size="sm"
            className="h-8 w-full font-mono text-[11px] uppercase mt-2"
            onClick={apply}
          >
            Aplicar {finalDamage} de Daño
          </Button>
        </>
      )}
    </Step>
  )
}
