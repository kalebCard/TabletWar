import React from "react"
import { Button } from "@/components/ui/button"
import { Step, DiceGrid, Result, RerollRow } from "@/components/combat/DiceRollStep"
import { rerollOnes, rerollFails, type Die } from "@/lib/game/dice"
import type { Weapon } from "@/lib/game/types"
import type { SaveResolution } from "@/lib/game/combat"

interface SavePhaseProps {
  weapon: Weapon;
  save: SaveResolution;
  stage: string;
  saveDice: Die[];
  savesToRoll: number;
  saved: number;
  unsaved: number;
  hasFnp: boolean;
  totalDamageBeforeFnp: number;
  setSaveDice: React.Dispatch<React.SetStateAction<Die[]>>;
  rollFnp: () => void;
  apply: () => void;
}

export function SavePhase({
  weapon,
  save,
  stage,
  saveDice,
  savesToRoll,
  saved,
  unsaved,
  hasFnp,
  totalDamageBeforeFnp,
  setSaveDice,
  rollFnp,
  apply,
}: SavePhaseProps) {
  if (!["save", "done"].includes(stage) || !save) return null;

  return (
    <Step
      n={3}
      title="Tirada de Salvación"
      sub={
        save.noSave
          ? "No es posible salvar"
          : `${save.target}+${save.usedInvuln ? " (invul)" : ""}${save.usedCover ? " +cobertura" : ""}`
      }
      active={stage === "save"}
      done={stage === "done"}
    >
      {save.noSave ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 font-mono text-[11px] text-destructive">
          FP{weapon.ap} anula la salvación &mdash; todas las {savesToRoll} heridas normales fallan.
        </div>
      ) : (
        <>
          <DiceGrid dice={saveDice} target={save.target} />
          <Result label="Salvadas" value={saved} of={savesToRoll} />
        </>
      )}
      <div className="mt-1 flex items-center justify-between rounded-md bg-destructive/15 px-2.5 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-destructive">No Salvadas</span>
        <span className="font-mono text-sm font-bold tabular-nums text-destructive">
          {unsaved} &times; D{weapon.damage} = {unsaved * weapon.damage}
        </span>
      </div>
      {stage === "save" && (
        <>
          {!save.noSave && (
            <RerollRow
              onOnes={() => setSaveDice((d) => rerollOnes(d))}
              onFails={() => setSaveDice((d) => rerollFails(d, save.target))}
            />
          )}
          <Button
            size="sm"
            className="h-8 w-full font-mono text-[11px] uppercase"
            onClick={hasFnp ? rollFnp : apply}
          >
            {hasFnp ? `Tirar No hay dolor (${totalDamageBeforeFnp} D) \u2192` : `Aplicar ${totalDamageBeforeFnp} de Daño`}
          </Button>
        </>
      )}
    </Step>
  )
}
