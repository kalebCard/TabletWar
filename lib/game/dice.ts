export interface Die {
  id: number
  value: number
  /** whether this die has already been re-rolled once */
  rerolled: boolean
}

/** Single D6 roll, 1-6. */
export function d6(): number {
  return 1 + Math.floor(Math.random() * 6)
}

let dieId = 0
export function rollDice(n: number): Die[] {
  const out: Die[] = []
  for (let i = 0; i < n; i++) {
    out.push({ id: dieId++, value: d6(), rerolled: false })
  }
  return out
}

export interface DieClass {
  success: boolean
  crit6: boolean
  crit1: boolean
}

/**
 * Classify a die against a target (roll >= target succeeds).
 * A natural 6 always succeeds and is a critical; a natural 1 always fails.
 */
export function classify(value: number, target: number): DieClass {
  const crit6 = value === 6
  const crit1 = value === 1
  const success = crit6 || (!crit1 && value >= target)
  return { success, crit6, crit1 }
}

export function countSuccesses(dice: Die[], target: number): number {
  return dice.reduce((n, d) => n + (classify(d.value, target).success ? 1 : 0), 0)
}

/** Re-roll every die whose natural value is 1 (once). */
export function rerollOnes(dice: Die[]): Die[] {
  return dice.map((d) => (!d.rerolled && d.value === 1 ? { ...d, value: d6(), rerolled: true } : d))
}

/** Re-roll every failing die (once). */
export function rerollFails(dice: Die[], target: number): Die[] {
  return dice.map((d) =>
    !d.rerolled && !classify(d.value, target).success ? { ...d, value: d6(), rerolled: true } : d,
  )
}

/** Sort a copy of the dice from highest to lowest for tidy display. */
export function sortedDesc(dice: Die[]): Die[] {
  return [...dice].sort((a, b) => b.value - a.value)
}
