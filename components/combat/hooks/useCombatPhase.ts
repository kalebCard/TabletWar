import { useState, useEffect } from "react";
import type { Die } from "@/lib/game/dice";
import type { ResolveResult } from "../../combat-panel";

type Stage = "setup" | "hit" | "wound" | "save" | "done" | "charge_roll";

export function useCombatPhase(attackerId?: string, weaponIdx?: number | null, targetId?: string | null, phase?: string, onSetTarget?: (id: string | null) => void) {
  const [stage, setStage] = useState<Stage>("setup");
  const [hitDice, setHitDice] = useState<Die[]>([]);
  const [woundDice, setWoundDice] = useState<Die[]>([]);
  const [saveDice, setSaveDice] = useState<Die[]>([]);
  const [summary, setSummary] = useState<ResolveResult | null>(null);
  
  const [fnpDice, setFnpDice] = useState<Die[]>([]);
  const [fnpStage, setFnpStage] = useState<boolean>(false);
  
  const [chargeDice, setChargeDice] = useState<Die[]>([]);

  // Reset the whole sequence whenever the actor, weapon, target or phase changes.
  useEffect(() => {
    setStage("setup");
    setHitDice([]);
    setWoundDice([]);
    setSaveDice([]);
    setSummary(null);
  }, [attackerId, weaponIdx, targetId, phase]);

  // Reset charge dice on attacker or target change
  useEffect(() => {
    setChargeDice([]);
  }, [attackerId, targetId]);

  return {
    stage, setStage,
    hitDice, setHitDice,
    woundDice, setWoundDice,
    saveDice, setSaveDice,
    summary, setSummary,
    fnpDice, setFnpDice,
    fnpStage, setFnpStage,
    chargeDice, setChargeDice
  };
}
