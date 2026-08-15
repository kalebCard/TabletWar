import React from "react"
import { Button } from "@/components/ui/button"
import { Step, DiceGrid, Result, RerollRow } from "@/components/combat/DiceRollStep"
import { rerollOnes, rerollFails, type Die } from "@/lib/game/dice"
import type { Weapon } from "@/lib/game/types"
import type { TargetInfo } from "@/lib/game/combat"

interface WoundPhaseProps {
  weapon: Weapon;
  target: TargetInfo;
  woundTgt: number;
  stage: string;
  woundDice: Die[];
  hits: number;
  woundCount: number;
  autoWounds: number;
  devWounds: number;
  hasTwinLinked: boolean;
  savesToRoll: number;
  hasFnp: boolean;
  setWoundDice: React.Dispatch<React.SetStateAction<Die[]>>;
  rollSaves: () => void;
  rollFnp: () => void;
  apply: () => void;
}

export function WoundPhase({
  weapon,
  target,
  woundTgt,
  stage,
  woundDice,
  hits,
  woundCount,
  autoWounds,
  devWounds,
  hasTwinLinked,
  savesToRoll,
  hasFnp,
  setWoundDice,
  rollSaves,
  rollFnp,
  apply,
}: WoundPhaseProps) {
  if (!["wound", "save", "done"].includes(stage)) return null;

  return (
    <Step
      n={2}
      title="Tirada para Herir"
      sub={`F${weapon.strength} vs R${target.token.stats.toughness} \u2192 ${woundTgt}+`}
      active={stage === "wound"}
      done={["save", "done"].includes(stage)}
    >
      <DiceGrid dice={woundDice} target={woundTgt} />
      <Result label="Heridas" value={woundCount} of={hits} />
      {autoWounds > 0 && (
        <div className="mt-1 text-right font-mono text-[10px] text-primary drop-shadow-sm uppercase">
          (+{autoWounds} Automáticas por Impactos Letales)
        </div>
      )}
      {devWounds > 0 && (
        <div className="mt-1 text-right font-mono text-[10px] text-destructive drop-shadow-sm uppercase">
          (¡{devWounds} Heridas Devastadoras!)
        </div>
      )}
      {hasTwinLinked && stage === "wound" && (
        <div className="mt-1 text-right font-mono text-[10px] text-primary drop-shadow-sm uppercase">
          Arma Acoplada: Puedes repetir la tirada
        </div>
      )}
      {stage === "wound" && (
        <>
          <RerollRow
            onOnes={() => setWoundDice((d) => rerollOnes(d))}
            onFails={() => setWoundDice((d) => rerollFails(d, woundTgt))}
          />
          <Button
            size="sm"
            disabled={savesToRoll === 0 && devWounds === 0}
            className="h-8 w-full font-mono text-[11px] uppercase"
            onClick={() => {
              if (savesToRoll === 0) {
                if (hasFnp) rollFnp()
                else apply()
              } else {
                rollSaves()
              }
            }}
          >
            {savesToRoll === 0 && devWounds === 0 ? "Sin heridas" : savesToRoll > 0 ? "Tirar Salvaciones \u2192" : (hasFnp ? "Tirar No hay dolor \u2192" : "Aplicar Daño \u2192")}
          </Button>
        </>
      )}
    </Step>
  )
}
