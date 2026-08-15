import type { Terrain, Token, Weapon } from "./types"
import { ENGAGEMENT_RANGE_IN } from "./constants"
import { baseGap, lineOfSight, pointInPolygon, segmentCrossesPolygon, type Pt } from "./geometry"
import { classify, countSuccesses, type Die } from "./dice"

/**
 * Wound roll target (roll >= target) comparing weapon Strength vs defender Toughness.
 * 11th-edition style ladder.
 */
export function woundTarget(strength: number, toughness: number): number {
  if (strength >= toughness * 2) return 2
  if (strength > toughness) return 3
  if (strength === toughness) return 4
  if (strength * 2 <= toughness) return 6
  return 5
}

export interface SaveResolution {
  target: number
  usedInvuln: boolean
  usedCover: boolean
  /** true when no save is possible (target > 6 and no invuln) */
  noSave: boolean
}

/**
 * Determine the save the defender rolls against.
 * ap is stored as a non-positive number (e.g. -1). Cover grants Benefit of Cover (+1),
 * which cannot improve an armour save of 3+ or better against AP 0.
 */
export function saveResolution(
  save: number,
  ap: number,
  cover: boolean,
  invuln?: number,
): SaveResolution {
  let armour = save - ap // ap negative -> larger (worse) number
  let usedCover = false
  if (cover && !(ap === 0 && save <= 3)) {
    armour -= 1
    usedCover = true
  }
  let target = armour
  let usedInvuln = false
  if (invuln != null && invuln < target) {
    target = invuln
    usedInvuln = true
    usedCover = false
  }
  target = Math.max(2, target)
  const noSave = target > 6
  return { target, usedInvuln, usedCover, noSave }
}

export function hasCover(shooter: Token, target: Token, terrain: Terrain[]): boolean {
  const tp: Pt = { x: target.x, y: target.y }
  for (const t of terrain) {
    if (t.type !== "cover" && t.type !== "obscuring") continue
    // Defender standing within a cover/obscuring footprint gets cover.
    if (pointInPolygon(tp, t.points)) return true
    // Or the intervening piece sits across the sightline.
    if (segmentCrossesPolygon(shooter, target, t.points)) return true
  }
  return false
}

export interface TargetInfo {
  token: Token
  distance: number
  losBlocked: boolean
  inRange: boolean
  cover: boolean
  eligible: boolean
}

/** Compute eligible targets for an attacker + weapon. */
export function eligibleTargets(
  attacker: Token,
  weapon: Weapon,
  tokens: Token[],
  terrain: Terrain[],
): TargetInfo[] {
  const isMonsterOrVehicle = (t: Token) => t.keywords.includes("Monster") || t.keywords.includes("Vehicle")
  const attackerIsBigGun = isMonsterOrVehicle(attacker)
  const isPistol = weapon.abilities?.includes("Pistola") ?? false
  
  // Check if attacker is in engagement range of ANY enemy
  const enemies = tokens.filter((t) => t.faction !== attacker.faction && t.currentWounds > 0)
  const attackerEngagedEnemies = enemies.filter(e => baseGap(attacker, e) <= ENGAGEMENT_RANGE_IN)
  const attackerIsEngaged = attackerEngagedEnemies.length > 0

  return enemies.map((token) => {
    const distance = baseGap(attacker, token)
    if (weapon.type === "melee") {
      const inRange = distance <= ENGAGEMENT_RANGE_IN
      return { token, distance, losBlocked: false, inRange, cover: false, eligible: inRange }
    }
    
    // Ranged attacks logic
    const los = lineOfSight(attacker, token, terrain)
    const inRange = distance <= weapon.range
    const cover = hasCover(attacker, token, terrain)
    
    let eligible = inRange && !los.blocked
    
    // Engagement range constraints for ranged attacks
    const targetIsBigGun = isMonsterOrVehicle(token)
    
    // Check if target is engaged with ANY of attacker's allies
    const allies = tokens.filter(t => t.faction === attacker.faction && t.currentWounds > 0 && t.id !== attacker.id)
    const targetIsEngagedWithAllies = allies.some(a => baseGap(a, token) <= ENGAGEMENT_RANGE_IN) || (attackerIsEngaged && attackerEngagedEnemies.includes(token))

    if (attackerIsEngaged) {
      // If attacker is engaged, can only shoot if Pistol or BigGun
      if (!isPistol && !attackerIsBigGun) {
        eligible = false
      }
      // If using Pistol, MUST target a unit they are engaged with
      if (isPistol && !attackerEngagedEnemies.includes(token)) {
        eligible = false
      }
    }
    
    if (targetIsEngagedWithAllies) {
      // Cannot target an engaged unit unless it's a BigGun, or shooting with a Pistol at a unit you are engaged with
      if (!targetIsBigGun && !(isPistol && attackerEngagedEnemies.includes(token))) {
        eligible = false
      }
    }

    return {
      token,
      distance,
      losBlocked: los.blocked,
      inRange,
      cover,
      eligible,
    }
  })
}

export function apLabel(ap: number): string {
  return ap === 0 ? "0" : `${ap}`
}

export function skillLabel(skill: number): string {
  return `${skill}+`
}

export interface HitResolution {
  hitsToRollWoundsFor: number
  autoWounds: number
}

export function resolveHits(
  hitDice: Die[],
  actualSkill: number,
  abilities: string[] = []
): HitResolution {
  const hasLethalHits = abilities.includes("Impactos Letales")
  const hasSustainedHits = abilities.some((a) => a.startsWith("Impactos Sostenidos"))
  const sustainedValue = hasSustainedHits 
    ? parseInt(abilities.find((a) => a.startsWith("Impactos Sostenidos"))?.split(" ")[2] || "1") 
    : 1

  let hitsToRollWoundsFor = 0
  let autoWounds = 0

  hitDice.forEach((d) => {
    const c = classify(d.value, actualSkill)
    if (c.crit6) {
      if (hasLethalHits) autoWounds++
      else hitsToRollWoundsFor++

      if (hasSustainedHits) hitsToRollWoundsFor += sustainedValue
    } else if (c.success) {
      hitsToRollWoundsFor++
    }
  })

  return { hitsToRollWoundsFor, autoWounds }
}

export interface WoundResolution {
  normalWounds: number
  devWounds: number
}

export function resolveWounds(
  woundDice: Die[],
  woundTgt: number,
  abilities: string[] = []
): WoundResolution {
  const hasDevastatingWounds = abilities.includes("Heridas Devastadoras")

  let normalWounds = 0
  let devWounds = 0

  woundDice.forEach((d) => {
    const c = classify(d.value, woundTgt)
    if (c.crit6) {
      if (hasDevastatingWounds) devWounds++
      else normalWounds++
    } else if (c.success) {
      normalWounds++
    }
  })

  return { normalWounds, devWounds }
}

export interface DamageResolution {
  finalDamage: number
  ignoredDamage: number
}

export function resolveDamage(
  unsavedWounds: number,
  damagePerWound: number,
  fnpDice: Die[],
  fnpTgt: number | null
): DamageResolution {
  const totalDamageBeforeFnp = unsavedWounds * damagePerWound
  
  if (fnpTgt === null || fnpDice.length === 0) {
    return { finalDamage: totalDamageBeforeFnp, ignoredDamage: 0 }
  }

  const ignoredDamage = countSuccesses(fnpDice, fnpTgt)
  const finalDamage = Math.max(0, totalDamageBeforeFnp - ignoredDamage)

  return { finalDamage, ignoredDamage }
}
