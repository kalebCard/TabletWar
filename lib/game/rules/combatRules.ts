import type { Token, Unit, Weapon } from "../types";

/**
 * Filter eligible weapons for an attacker based on game rules (fell back, advanced, weapon type).
 */
export function getEligibleWeapons(
  attacker: Token,
  attackerUnit: Unit | null | undefined,
  weaponType: "melee" | "ranged"
): Weapon[] {
  if (!attacker) return [];
  
  return attacker.weapons.filter(w => {
    if (w.type !== weaponType) return false;
    // Cannot attack if fell back
    if (attackerUnit?.fellBack) return false;
    // Cannot shoot if advanced unless weapon has Asalto
    if (weaponType === "ranged" && attackerUnit?.advanced && !w.abilities?.includes("Asalto")) return false;
    
    return true;
  });
}

export interface ChargeTargetInfo {
  token: Token;
  distance: number;
}

/**
 * Calculates eligible charge targets (enemies within 12")
 */
export function getChargeTargets(
  attacker: Token,
  tokens: Token[]
): ChargeTargetInfo[] {
  const tgs: ChargeTargetInfo[] = [];
  
  tokens.forEach(t => {
    if (t.faction !== attacker.faction && t.currentWounds > 0) {
      // approximate distance for now (center to center minus bases)
      const d = Math.hypot(t.x - attacker.x, t.y - attacker.y) - (attacker.baseMm / 25.4 / 2) - (t.baseMm / 25.4 / 2);
      if (d <= 12) {
        tgs.push({ token: t, distance: d });
      }
    }
  });
  
  return tgs.sort((a, b) => a.distance - b.distance);
}

/**
 * Checks if the attacker is prevented from attacking in the current phase due to general rules.
 */
export function canAttackerAct(
  attackerUnit: Unit | null | undefined,
  phase: string
): { canAct: boolean; reason?: string } {
  if (attackerUnit?.fellBack) {
    return { canAct: false, reason: `se retiró este turno y no puede ${phase === "charge" ? "cargar" : "atacar"}.` };
  }
  
  if (phase === "charge" && attackerUnit?.advanced) {
    return { canAct: false, reason: "avanzó este turno y no puede cargar." };
  }
  
  return { canAct: true };
}

/**
 * Helper rules for weapon abilities
 */
export const WeaponRules = {
  hasTwinLinked: (weapon: Weapon | null) => weapon?.abilities?.includes("Acoplada") ?? false,
  isPistol: (weapon: Weapon | null) => weapon?.abilities?.includes("Pistola") ?? false,
};
