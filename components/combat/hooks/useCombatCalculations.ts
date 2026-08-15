import { useMemo } from "react";
import type { Token, Weapon } from "@/lib/game/types";
import { WeaponRules } from "@/lib/game/rules/combatRules";
import { saveResolution, woundTarget, resolveHits, resolveWounds, resolveDamage } from "@/lib/game/combat";
import { countSuccesses, type Die } from "@/lib/game/dice";
import type { TargetInfo } from "@/lib/game/combat";

interface CombatCalculationProps {
  weapon: Weapon | null;
  attacker: Token | null;
  target: TargetInfo | null;
  tokens: Token[];
  weaponType: "melee" | "ranged";
  hitDice: Die[];
  woundDice: Die[];
  saveDice: Die[];
  fnpDice: Die[];
}

export function useCombatCalculations({
  weapon,
  attacker,
  target,
  tokens,
  weaponType,
  hitDice,
  woundDice,
  saveDice,
  fnpDice
}: CombatCalculationProps) {
  return useMemo(() => {
    // ---- abilities ----
    const hasTwinLinked = WeaponRules.hasTwinLinked(weapon);
    const isPistol = WeaponRules.isPistol(weapon);
    
    // Memoized engaged check to avoid iterating all tokens if not needed
    const inEng = attacker ? tokens.some(x => 
      x.faction !== attacker.faction && 
      x.currentWounds > 0 && 
      x.id !== attacker.id && 
      (Math.hypot(x.x - attacker.x, x.y - attacker.y) - (x.baseMm / 25.4 / 2) - (attacker.baseMm / 25.4 / 2)) <= 1.0
    ) : false;

    const tgtEng = target ? tokens.some(x => 
      x.faction !== target.token.faction && 
      x.currentWounds > 0 && 
      x.id !== target.token.id && 
      (Math.hypot(x.x - target.token.x, x.y - target.token.y) - (x.baseMm / 25.4 / 2) - (target.token.baseMm / 25.4 / 2)) <= 1.0
    ) : false;

    const bgntPenalty = weaponType === "ranged" && !isPistol && (inEng || tgtEng);
    const actualSkill = Math.min(6, (weapon?.skill ?? 6) + (bgntPenalty ? 1 : 0));

    // ---- derived counts via pure functions ----
    const weaponAbilities = weapon?.abilities || [];
    const { hitsToRollWoundsFor, autoWounds } = resolveHits(hitDice, actualSkill, weaponAbilities);
    const hits = hitsToRollWoundsFor + autoWounds;

    const woundTgt = weapon && target ? woundTarget(weapon.strength, target.token.stats.toughness) : 0;
    const { normalWounds, devWounds } = resolveWounds(woundDice, woundTgt, weaponAbilities);

    const savesToRoll = normalWounds + autoWounds;
    const woundCount = savesToRoll + devWounds;
    
    const save = weapon && target
      ? saveResolution(target.token.stats.save, weapon.ap, target.cover, target.token.stats.invuln)
      : null;
    const saved = save && !save.noSave ? countSuccesses(saveDice, save.target) : 0;
    const unsavedNormal = savesToRoll - saved;
    const unsaved = unsavedNormal + devWounds;

    // FNP
    const fnpTgt = target?.token.stats.fnp ?? null;
    const hasFnp = fnpTgt !== null;
    
    const { finalDamage, ignoredDamage } = resolveDamage(unsaved, weapon?.damage ?? 1, fnpDice, fnpTgt);
    const totalDamageBeforeFnp = unsaved * (weapon?.damage ?? 1);

    return {
      hasTwinLinked,
      bgntPenalty,
      actualSkill,
      hitsToRollWoundsFor,
      autoWounds,
      hits,
      woundTgt,
      normalWounds,
      devWounds,
      savesToRoll,
      woundCount,
      save,
      saved,
      unsaved,
      fnpTgt,
      hasFnp,
      finalDamage,
      ignoredDamage,
      totalDamageBeforeFnp
    };
  }, [
    weapon, attacker, target, tokens, weaponType, 
    hitDice, woundDice, saveDice, fnpDice
  ]);
}
