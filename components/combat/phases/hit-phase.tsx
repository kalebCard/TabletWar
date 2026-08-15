import React from "react"
import { Button } from "@/components/ui/button"
import { Step, DiceGrid, Result, RerollRow } from "@/components/combat/DiceRollStep"
import { skillLabel } from "@/lib/game/combat"
import { rerollOnes, rerollFails, type Die } from "@/lib/game/dice"
import type { Weapon } from "@/lib/game/types"
import type { TargetInfo } from "@/lib/game/combat"

interface HitPhaseProps {
  weapon: Weapon;
  target: TargetInfo;
  actualSkill: number;
  bgntPenalty: boolean;
  stage: string;
  hitDice: Die[];
  hits: number;
  hitsToRollWoundsFor: number;
  autoWounds: number;
  rollHits: () => void;
  rollWounds: () => void;
  setHitDice: React.Dispatch<React.SetStateAction<Die[]>>;
}

export function HitPhase({
  weapon,
  target,
  actualSkill,
  bgntPenalty,
  stage,
  hitDice,
  hits,
  hitsToRollWoundsFor,
  autoWounds,
  rollHits,
  rollWounds,
  setHitDice,
}: HitPhaseProps) {
  return (
    <Step
      n={1}
      title="Tirada para Impactar"
      sub={`Impacta a ${skillLabel(actualSkill)}${bgntPenalty ? " (-1 BGNT)" : ""}`}
      active={stage === "setup" || stage === "hit"}
      done={["wound", "save", "done"].includes(stage)}
    >
      {stage === "setup" && (
        <Button size="sm" className="h-8 w-full font-mono text-[11px] uppercase" onClick={rollHits} disabled={!target?.eligible}>
          {target?.eligible ? `Tirar ${weapon.attacks} para Impactar` : "Objetivo inválido"}
        </Button>
      )}
      {["hit", "wound", "save", "done"].includes(stage) && hitDice.length > 0 && (
        <>
          <DiceGrid dice={hitDice} target={actualSkill} />
          <Result label="Impactos" value={hits} of={weapon.attacks} />
          {stage === "hit" && (
            <>
              <RerollRow
                onOnes={() => setHitDice((d) => rerollOnes(d))}
                onFails={() => setHitDice((d) => rerollFails(d, actualSkill))}
              />
              <Button
                size="sm"
                disabled={hitsToRollWoundsFor === 0 && autoWounds === 0}
                className="h-8 w-full font-mono text-[11px] uppercase"
                onClick={rollWounds}
              >
                {hitsToRollWoundsFor === 0 && autoWounds === 0 
                  ? "Sin impactos" 
                  : hitsToRollWoundsFor > 0 ? `Tirar ${hitsToRollWoundsFor} para Herir \u2192` : `Heridas automáticas \u2192`}
              </Button>
            </>
          )}
        </>
      )}
    </Step>
  )
}
