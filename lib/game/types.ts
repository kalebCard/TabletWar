export type FactionId = "imperium" | "chaos"
// Standard base sizes in millimeters
export type BaseSizeMm = 25 | 28 | 32 | 40 | 50 | 60 | 80 | 100 | 120 | 160

export interface UnitStats {
  /** Movement in inches */
  move: number
  /** Toughness */
  toughness: number
  /** Save (armour) e.g. 3 => 3+ */
  save: number
  /** Invulnerable save, e.g. 4 => 4++ (optional) */
  invuln?: number
  /** Wounds */
  wounds: number
  /** Objective Control */
  oc: number
  /** Leadership (Ld) e.g. 6 => 6+ */
  leadership: number
  /** Feel No Pain (FNP) e.g. 5 => 5+ (optional) */
  fnp?: number
}

export interface Weapon {
  name: string
  type: "ranged" | "melee"
  /** range in inches (0 for melee) */
  range: number
  /** number of attacks */
  attacks: number
  /** hit on skill+ (BS for ranged, WS for melee) */
  skill: number
  /** Strength */
  strength: number
  /** Armour Penetration, non-positive (0, -1, -2 ...) */
  ap: number
  /** Damage per unsaved wound */
  damage: number
  /** Special abilities like Lethal Hits, Sustained Hits, etc. */
  abilities?: string[]
}

export interface Token {
  id: string
  unitId: string
  name: string
  faction: FactionId
  /** position of the base center, in inches, from board top-left */
  x: number
  y: number
  z?: number // Elevation height (in pixels/inches)
  rotation: number
  baseMm: BaseSizeMm
  stats: UnitStats
  weapons: Weapon[]
  /** current wounds remaining */
  currentWounds: number
  /** has this unit already moved this phase */
  moved: boolean
  keywords: string[]
  abilities?: string[]
  embarkedIn?: string // ID del transporte
  /** Miniature image URL */
  image?: string
}

export interface Unit {
  id: string
  name: string
  faction: FactionId
  tokenIds: string[]
  startingTokens: number
  isBattleShocked: boolean
  hasFought: boolean
  hasCharged: boolean
  advanced?: boolean
  advanceRoll?: number
  fellBack?: boolean
  transportCapacity?: number
  embarkedUnits?: string[]
}

export type TerrainType = "obscuring" | "cover" | "impassable"

export interface Terrain {
  id: string
  type: TerrainType
  /** polygon vertices in inches */
  points: { x: number; y: number }[]
  label?: string
  height?: number
  /** optional z-heights (in pixels) for each point in the footprint, for sloped triangular walls */
  zHeights?: number[]
  platforms?: { height: number; points?: { x: number; y: number }[] }[]
  corner?: 'TL' | 'TR' | 'BL' | 'BR' // Helps Z-sorting for L-shapes
}

export type Phase = "roster" | "deployment" | "command" | "movement" | "shooting" | "charge" | "fight"

export const PHASES: Phase[] = ["roster", "deployment", "command", "movement", "shooting", "charge", "fight"]

export interface Datasheet {
  id: string
  name: string
  faction: FactionId
  points: number
  models: {
    baseMm: BaseSizeMm
    stats: UnitStats
    weapons: Weapon[]
  }[]
  keywords: string[]
  abilities?: string[]
  transportCapacity?: number
  /** Path to miniature image */
  image?: string
}

export interface RosterUnit {
  id: string
  datasheetId: string
  faction: FactionId
  deployed: boolean
}

export interface GameState {
  terrainLayout: string // "custom", "leviathan-1", etc.
  round: number
  activePlayer: FactionId
  phase: Phase
  vp: Record<FactionId, number>
  cp: Record<FactionId, number>
  pointsLimit: number
  winner?: FactionId | "draw" | null
  victoryReason?: string
}

export interface Faction {
  id: FactionId
  name: string
  /** css color token or hex */
  color: string
  colorSoft: string
}

export type LogKind = "attack" | "casualty" | "phase" | "info"

export interface LogEntry {
  id: string
  kind: LogKind
  faction?: FactionId
  round: number
  text: string
}

export interface QueuedAttack {
  attackerId: string
  targetId: string
  phase: 'shooting' | 'fight'
  weaponIdx?: number
}
