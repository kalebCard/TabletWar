import type { BaseSizeMm, Faction, FactionId, Terrain, Token, Weapon, Datasheet, Unit } from "./types"

/** Standard 40k battlefield in inches */
export const BOARD_WIDTH_IN = 60
export const BOARD_HEIGHT_IN = 44

/** Engagement range in inches */
export const ENGAGEMENT_RANGE_IN = 1

export const MM_PER_INCH = 25.4

export function mmToInches(mm: BaseSizeMm): number {
  return mm / MM_PER_INCH
}

export const FACTIONS: Record<FactionId, Faction> = {
  imperium: {
    id: "imperium",
    name: "Imperio",
    color: "oklch(0.72 0.15 240)",
    colorSoft: "oklch(0.72 0.15 240 / 0.18)",
  },
  chaos: {
    id: "chaos",
    name: "Caos",
    color: "oklch(0.62 0.2 25)",
    colorSoft: "oklch(0.62 0.2 25 / 0.18)",
  },
}

let idCounter = 0
export const uid = (p: string) => `${p}-${(idCounter++).toString(36)}`

// Reusable weapon profiles
const W = {
  bolt_rifle: (): Weapon => ({ name: "Rifle Bólter", type: "ranged", range: 24, attacks: 2, skill: 3, strength: 4, ap: -1, damage: 1, abilities: ["Asalto", "Pesada"] }),
  bolt_pistol: (): Weapon => ({ name: "Pistola Bólter", type: "ranged", range: 12, attacks: 1, skill: 3, strength: 4, ap: 0, damage: 1, abilities: ["Pistola"] }),
  plasma: (): Weapon => ({ name: "Incinerador de Plasma", type: "ranged", range: 24, attacks: 2, skill: 3, strength: 8, ap: -3, damage: 2, abilities: ["Pesada"] }),
  macro_plasma: (): Weapon => ({ name: "Macro Plasma", type: "ranged", range: 36, attacks: 4, skill: 3, strength: 9, ap: -3, damage: 3, abilities: ["Explosiva"] }),
  flamestorm: (): Weapon => ({ name: "Guanteletes Tormenta de Fuego", type: "ranged", range: 12, attacks: 6, skill: 3, strength: 6, ap: -1, damage: 1, abilities: ["Ignora Cobertura", "Torrente"] }),
  multi_melta: (): Weapon => ({ name: "Cañón Fusión", type: "ranged", range: 18, attacks: 2, skill: 3, strength: 9, ap: -4, damage: 6, abilities: ["Fusión 2"] }),
  power_fist: (): Weapon => ({ name: "Puño de Combate", type: "melee", range: 0, attacks: 5, skill: 2, strength: 8, ap: -2, damage: 2 }),
  chainsword: (): Weapon => ({ name: "Espada Sierra Astartes", type: "melee", range: 0, attacks: 4, skill: 3, strength: 4, ap: -1, damage: 1 }),
  fists: (): Weapon => ({ name: "Arma de Combate Cuerpo a Cuerpo", type: "melee", range: 0, attacks: 3, skill: 3, strength: 4, ap: 0, damage: 1 }),
  redemptor_fist: (): Weapon => ({ name: "Puño Redemptor", type: "melee", range: 0, attacks: 5, skill: 3, strength: 12, ap: -2, damage: 3 }),
  hellbrute_fist: (): Weapon => ({ name: "Puño Helbrute", type: "melee", range: 0, attacks: 4, skill: 3, strength: 12, ap: -2, damage: 3 }),
  power_sword: (): Weapon => ({ name: "Espada Demoníaca", type: "melee", range: 0, attacks: 6, skill: 2, strength: 6, ap: -3, damage: 2, abilities: ["Heridas Devastadoras"] }),
}

export const DATASHEETS: Datasheet[] = [
  // IMPERIUM
  {
    id: "ds-captain",
    name: "Capitán",
    faction: "imperium",
    points: 80,
    models: [
      { baseMm: 40, stats: { move: 6, toughness: 4, save: 3, invuln: 4, wounds: 5, oc: 1, leadership: 6 }, weapons: [W.plasma(), W.power_fist()] }
    ],
    keywords: ["Infantry", "Character", "Captain"],
    abilities: ["Líder"],
    image: (process.env.NEXT_PUBLIC_BASE_PATH || '') + "/assets/minis/mini_captain.png"
  },
  {
    id: "ds-intercessors",
    name: "Escuadra de Intercesores",
    faction: "imperium",
    points: 85,
    models: [
      { baseMm: 32, stats: { move: 6, toughness: 4, save: 3, wounds: 2, oc: 2, leadership: 6 }, weapons: [W.bolt_rifle(), W.fists()] },
      { baseMm: 32, stats: { move: 6, toughness: 4, save: 3, wounds: 2, oc: 2, leadership: 6 }, weapons: [W.bolt_rifle(), W.fists()] },
      { baseMm: 32, stats: { move: 6, toughness: 4, save: 3, wounds: 2, oc: 2, leadership: 6 }, weapons: [W.bolt_rifle(), W.fists()] },
      { baseMm: 32, stats: { move: 6, toughness: 4, save: 3, wounds: 2, oc: 2, leadership: 6 }, weapons: [W.bolt_rifle(), W.fists()] },
      { baseMm: 32, stats: { move: 6, toughness: 4, save: 3, wounds: 2, oc: 2, leadership: 6 }, weapons: [W.bolt_rifle(), W.fists()] }
    ],
    keywords: ["Infantry"],
    image: (process.env.NEXT_PUBLIC_BASE_PATH || '') + "/assets/minis/mini_intercessors.png"
  },
  {
    id: "ds-redemptor",
    name: "Dreadnought Redemptor",
    faction: "imperium",
    points: 210,
    models: [
      { baseMm: 60, stats: { move: 8, toughness: 10, save: 2, wounds: 12, oc: 3, leadership: 6 }, weapons: [W.macro_plasma(), W.redemptor_fist()] }
    ],
    keywords: ["Vehicle", "Walker"],
    abilities: ["Deadly Demise 1"],
    image: (process.env.NEXT_PUBLIC_BASE_PATH || '') + "/assets/minis/mini_redemptor.png"
  },
  {
    id: "ds-aggressors",
    name: "Escuadra de Agresores",
    faction: "imperium",
    points: 120,
    models: [
      { baseMm: 40, stats: { move: 5, toughness: 5, save: 3, wounds: 4, oc: 1, leadership: 6 }, weapons: [W.flamestorm(), W.power_fist()] },
      { baseMm: 40, stats: { move: 5, toughness: 5, save: 3, wounds: 4, oc: 1, leadership: 6 }, weapons: [W.flamestorm(), W.power_fist()] },
      { baseMm: 40, stats: { move: 5, toughness: 5, save: 3, wounds: 4, oc: 1, leadership: 6 }, weapons: [W.flamestorm(), W.power_fist()] }
    ],
    keywords: ["Infantry"],
    image: (process.env.NEXT_PUBLIC_BASE_PATH || '') + "/assets/minis/mini_aggressors.png"
  },
  // CHAOS
  {
    id: "ds-chaos-lord",
    name: "Señor del Caos",
    faction: "chaos",
    points: 90,
    models: [
      { baseMm: 40, stats: { move: 6, toughness: 4, save: 3, invuln: 4, wounds: 5, oc: 1, leadership: 6 }, weapons: [W.bolt_pistol(), W.power_sword()] }
    ],
    keywords: ["Infantry", "Character", "Chaos Lord"],
    abilities: ["Líder"],
    image: (process.env.NEXT_PUBLIC_BASE_PATH || '') + "/assets/minis/mini_chaos_lord.png"
  },
  {
    id: "ds-legionaries",
    name: "Legionarios",
    faction: "chaos",
    points: 90,
    models: [
      { baseMm: 32, stats: { move: 6, toughness: 4, save: 3, wounds: 2, oc: 2, leadership: 6 }, weapons: [W.bolt_rifle(), W.chainsword()] },
      { baseMm: 32, stats: { move: 6, toughness: 4, save: 3, wounds: 2, oc: 2, leadership: 6 }, weapons: [W.bolt_rifle(), W.chainsword()] },
      { baseMm: 32, stats: { move: 6, toughness: 4, save: 3, wounds: 2, oc: 2, leadership: 6 }, weapons: [W.bolt_rifle(), W.chainsword()] },
      { baseMm: 32, stats: { move: 6, toughness: 4, save: 3, wounds: 2, oc: 2, leadership: 6 }, weapons: [W.bolt_rifle(), W.chainsword()] },
      { baseMm: 32, stats: { move: 6, toughness: 4, save: 3, wounds: 2, oc: 2, leadership: 6 }, weapons: [W.bolt_rifle(), W.chainsword()] }
    ],
    keywords: ["Infantry"],
    image: (process.env.NEXT_PUBLIC_BASE_PATH || '') + "/assets/minis/mini_legionaries.png"
  },
  {
    id: "ds-helbrute",
    name: "Helbrute",
    faction: "chaos",
    points: 130,
    models: [
      { baseMm: 60, stats: { move: 6, toughness: 9, save: 3, wounds: 8, oc: 3, leadership: 6 }, weapons: [W.multi_melta(), W.hellbrute_fist()] }
    ],
    keywords: ["Vehicle", "Walker"],
    abilities: ["Deadly Demise 1"],
    image: (process.env.NEXT_PUBLIC_BASE_PATH || '') + "/assets/minis/mini_helbrute.png"
  },
  {
    id: "ds-terminators",
    name: "Escuadra de Exterminadores",
    faction: "chaos",
    points: 185,
    models: [
      { baseMm: 40, stats: { move: 5, toughness: 5, save: 2, invuln: 4, wounds: 3, oc: 1, leadership: 6 }, weapons: [W.plasma(), W.power_fist()] },
      { baseMm: 40, stats: { move: 5, toughness: 5, save: 2, invuln: 4, wounds: 3, oc: 1, leadership: 6 }, weapons: [W.plasma(), W.power_fist()] },
      { baseMm: 40, stats: { move: 5, toughness: 5, save: 2, invuln: 4, wounds: 3, oc: 1, leadership: 6 }, weapons: [W.plasma(), W.power_fist()] },
      { baseMm: 40, stats: { move: 5, toughness: 5, save: 2, invuln: 4, wounds: 3, oc: 1, leadership: 6 }, weapons: [W.plasma(), W.power_fist()] },
      { baseMm: 40, stats: { move: 5, toughness: 5, save: 2, invuln: 4, wounds: 3, oc: 1, leadership: 6 }, weapons: [W.plasma(), W.power_fist()] }
    ],
    keywords: ["Infantry", "Terminator"],
    image: (process.env.NEXT_PUBLIC_BASE_PATH || '') + "/assets/minis/mini_terminators.png"
  },
  {
    id: "ds-rhino",
    name: "Chaos Rhino",
    faction: "chaos",
    points: 75,
    models: [
      { baseMm: 100, stats: { move: 12, toughness: 9, save: 3, wounds: 10, oc: 2, leadership: 6 }, weapons: [W.bolt_rifle()] }
    ],
    keywords: ["Vehicle", "Transport", "Dedicated Transport"],
    transportCapacity: 12,
    image: (process.env.NEXT_PUBLIC_BASE_PATH || '') + "/assets/minis/mini_rhino.png"
  },
  {
    id: "ds-impulsor",
    name: "Impulsor",
    faction: "imperium",
    points: 80,
    models: [
      { baseMm: 100, stats: { move: 12, toughness: 9, save: 3, wounds: 11, oc: 2, leadership: 6 }, weapons: [W.bolt_rifle()] }
    ],
    keywords: ["Vehicle", "Transport", "Dedicated Transport"],
    transportCapacity: 6,
    image: (process.env.NEXT_PUBLIC_BASE_PATH || '') + "/assets/minis/mini_impulsor.png"
  }
]

export function createUnitFromDatasheet(
  ds: Datasheet,
  rosterUnitId: string,
  startX: number,
  startY: number
): { unit: Unit; tokens: Token[] } {
  const tokens: Token[] = []
  
  const u: Unit = {
    id: rosterUnitId, // we map roster unit ID directly to game unit ID
    name: ds.name,
    faction: ds.faction,
    tokenIds: [],
    startingTokens: ds.models.length,
    isBattleShocked: false,
    hasFought: false,
    hasCharged: false,
    advanced: false,
    fellBack: false,
    transportCapacity: ds.transportCapacity,
    embarkedUnits: ds.transportCapacity ? [] : undefined,
  }

  // Deploy in a tight block (e.g. 2 ranks)
  const columns = Math.ceil(Math.sqrt(ds.models.length))
  ds.models.forEach((m, i) => {
    const col = i % columns
    const row = Math.floor(i / columns)
    const spacing = 1.5 // inches
    const x = startX + col * spacing
    const y = startY + row * spacing
    
    const t: Token = {
      id: uid(ds.faction + "-model"),
      unitId: u.id,
      name: ds.models.length > 1 ? `${ds.name} ${i + 1}` : ds.name,
      faction: ds.faction,
      x,
      y,
      rotation: 0,
      baseMm: m.baseMm,
      stats: m.stats,
      weapons: m.weapons,
      currentWounds: m.stats.wounds,
      moved: false,
      keywords: [...ds.keywords],
      abilities: ds.abilities ? [...ds.abilities] : [],
      image: ds.image,
    }
    u.tokenIds.push(t.id)
    tokens.push(t)
  })

  return { unit: u, tokens }
}

export function makeInitialTerrain(layoutId: string = "custom"): Terrain[] {
  if (layoutId === "leviathan-1") return makeLeviathan1Terrain();
  if (layoutId === "combat-patrol") return makeCombatPatrolTerrain();
  return makeCustomTerrain();
}

function makeCustomTerrain(): Terrain[] {
  return [
    // --- 4x Large Ruins (Deployment Zones) ---
    // Top: Normal height (80) with 3" wide platform on top.
    { id: "ruin-tl", type: "obscuring", label: "Ruina Pesada", height: 80, corner: 'BR', platforms: [{height: 80, points: lShape(6, 6, 9, 5, 3, 'BR')}], points: lShape(6, 6, 9, 5, 0.5, 'BR') },
    { id: "ruin-tr", type: "obscuring", label: "Ruina Pesada", height: 80, corner: 'BL', platforms: [{height: 80, points: lShape(45, 6, 9, 5, 3, 'BL')}], points: lShape(45, 6, 9, 5, 0.5, 'BL') },
    // Bottom: 1.5 height (120) with middle platform (80), NO ROOF.
    { id: "ruin-bl", type: "obscuring", label: "Ruina Colosal", height: 120, corner: 'TR', platforms: [{height: 80, points: lShape(6, 33, 9, 5, 3, 'TR')}], points: lShape(6, 33, 9, 5, 0.5, 'TR') },
    { id: "ruin-br", type: "obscuring", label: "Ruina Colosal", height: 120, corner: 'TL', platforms: [{height: 80, points: lShape(45, 33, 9, 5, 3, 'TL')}], points: lShape(45, 33, 9, 5, 0.5, 'TL') },

    // --- 2x Large Ruins (Center Blockers) ---
    // Mid: Sloped Triangular Ruins
    { 
      id: "ruin-mid-l", 
      type: "obscuring", 
      label: "Ruina Triangular Pequeña", 
      height: 40, // Base height, but overridden by zHeights for rendering
      zHeights: [0, 40, 0, 0, 40, 0], // Sloped TR corner
      corner: 'TR', 
      platforms: [], 
      points: lShape(20, 13, 5, 9, 0.5, 'TR') 
    },
    { 
      id: "ruin-mid-r", 
      type: "obscuring", 
      label: "Ruina Triangular Alta", 
      height: 80, // Base height
      zHeights: [0, 0, 80, 0, 0, 80], // Sloped BL corner
      corner: 'BL', 
      platforms: [], 
      points: lShape(35, 22, 5, 9, 0.5, 'BL') 
    },
    
    // --- 4x Containers / Small Ruins ---
    // 5" x 3" solid crates, always have a roof at height 30.
    { id: "crate-top", type: "cover", label: "Contenedor", height: 30, platforms: [{height: 30}], points: rect(27.5, 6, 5, 3) },
    { id: "crate-bot", type: "cover", label: "Contenedor", height: 30, platforms: [{height: 30}], points: rect(27.5, 35, 5, 3) },
    
    // --- 2x Medio U Bunkers (Shallow U-shapes with 2-story parapet design) ---
    // Single U-shape structure, but with the 2-story half-cover style (height 120, platform at 80).
    { id: "bunker-l", type: "obscuring", label: "Ruina U", height: 120, platforms: [{height: 80, points: uShape(8, 16, 5, 10, 3, 'RIGHT')}], points: uShape(8, 16, 5, 10, 0.5, 'RIGHT') },
    { id: "bunker-r", type: "obscuring", label: "Ruina U", height: 120, platforms: [{height: 80, points: uShape(46, 16, 5, 10, 3, 'LEFT')}], points: uShape(46, 16, 5, 10, 0.5, 'LEFT') },


    // --- Scattered Decorative Barrels (Clusters of 3 and 2) ---
    // Moved away from walls to prevent isometric depth sorting glitches
    // Cluster 1 (3 barrels)
    { id: "barrel-1a", type: "cover", label: "Barril", height: 15, platforms: [{height: 15}], points: rect(22, 7, 0.3, 0.3) },
    { id: "barrel-1b", type: "cover", label: "Barril", height: 15, platforms: [{height: 15}], points: rect(22.4, 7, 0.3, 0.3) },
    { id: "barrel-1c", type: "cover", label: "Barril", height: 15, platforms: [{height: 15}], points: rect(22.2, 7.4, 0.3, 0.3) },
    
    // Cluster 2 (2 barrels)
    { id: "barrel-2a", type: "cover", label: "Barril", height: 15, platforms: [{height: 15}], points: rect(37, 7, 0.3, 0.3) },
    { id: "barrel-2b", type: "cover", label: "Barril", height: 15, platforms: [{height: 15}], points: rect(37.4, 7.15, 0.3, 0.3) },

    // Cluster 3 (3 barrels)
    { id: "barrel-3a", type: "cover", label: "Barril", height: 15, platforms: [{height: 15}], points: rect(22, 35, 0.3, 0.3) },
    { id: "barrel-3b", type: "cover", label: "Barril", height: 15, platforms: [{height: 15}], points: rect(22.4, 35, 0.3, 0.3) },
    { id: "barrel-3c", type: "cover", label: "Barril", height: 15, platforms: [{height: 15}], points: rect(22.2, 35.4, 0.3, 0.3) },

    // Cluster 4 (2 barrels)
    { id: "barrel-4a", type: "cover", label: "Barril", height: 15, platforms: [{height: 15}], points: rect(37, 35, 0.3, 0.3) },
    { id: "barrel-4b", type: "cover", label: "Barril", height: 15, platforms: [{height: 15}], points: rect(37.1, 35.4, 0.3, 0.3) },

    // Cluster 5 (3 barrels in the center)
    { id: "barrel-5a", type: "cover", label: "Barril", height: 15, platforms: [{height: 15}], points: rect(30, 26, 0.3, 0.3) },
    { id: "barrel-5b", type: "cover", label: "Barril", height: 15, platforms: [{height: 15}], points: rect(30.4, 26.1, 0.3, 0.3) },
    { id: "barrel-5c", type: "cover", label: "Barril", height: 15, platforms: [{height: 15}], points: rect(30.2, 25.7, 0.3, 0.3) },

  ]
}

function makeLeviathan1Terrain(): Terrain[] {
  // Leviathan Layout 1 (Official 60x44 board)
  // All ruins use our 3D modular pieces but placed according to the tournament layout footprint sizes.
  return [
    // 4x Large Ruins (12x6 footprint)
    { id: "lev1-l1", type: "obscuring", label: "Ruina Colosal", height: 120, corner: 'BR', platforms: [{height: 80, points: lShape(9, 6, 12, 6, 3, 'BR')}], points: lShape(9, 6, 12, 6, 0.5, 'BR') },
    { id: "lev1-l2", type: "obscuring", label: "Ruina Colosal", height: 120, corner: 'BL', platforms: [{height: 80, points: lShape(39, 6, 12, 6, 3, 'BL')}], points: lShape(39, 6, 12, 6, 0.5, 'BL') },
    { id: "lev1-l3", type: "obscuring", label: "Ruina Colosal", height: 120, corner: 'TR', platforms: [{height: 80, points: lShape(9, 32, 12, 6, 3, 'TR')}], points: lShape(9, 32, 12, 6, 0.5, 'TR') },
    { id: "lev1-l4", type: "obscuring", label: "Ruina Colosal", height: 120, corner: 'TL', platforms: [{height: 80, points: lShape(39, 32, 12, 6, 3, 'TL')}], points: lShape(39, 32, 12, 6, 0.5, 'TL') },
    
    // 2x Medium Ruins (10x5 footprint) - Center Line
    { id: "lev1-m1", type: "obscuring", label: "Ruina U", height: 120, platforms: [{height: 80, points: uShape(25, 12, 10, 5, 3, 'BOTTOM')}], points: uShape(25, 12, 10, 5, 0.5, 'BOTTOM') },
    { id: "lev1-m2", type: "obscuring", label: "Ruina U", height: 120, platforms: [{height: 80, points: uShape(25, 27, 10, 5, 3, 'TOP')}], points: uShape(25, 27, 10, 5, 0.5, 'TOP') },
    
    // 4x Small Ruins (6x4 footprint) - Flanks
    { id: "lev1-s1", type: "obscuring", label: "Ruina Pequeña", height: 80, corner: 'BR', platforms: [{height: 80, points: lShape(2, 18, 6, 4, 3, 'BR')}], points: lShape(2, 18, 6, 4, 0.5, 'BR') },
    { id: "lev1-s2", type: "obscuring", label: "Ruina Pequeña", height: 80, corner: 'TR', platforms: [{height: 80, points: lShape(2, 22, 6, 4, 3, 'TR')}], points: lShape(2, 22, 6, 4, 0.5, 'TR') },
    { id: "lev1-s3", type: "obscuring", label: "Ruina Pequeña", height: 80, corner: 'BL', platforms: [{height: 80, points: lShape(52, 18, 6, 4, 3, 'BL')}], points: lShape(52, 18, 6, 4, 0.5, 'BL') },
    { id: "lev1-s4", type: "obscuring", label: "Ruina Pequeña", height: 80, corner: 'TL', platforms: [{height: 80, points: lShape(52, 22, 6, 4, 3, 'TL')}], points: lShape(52, 22, 6, 4, 0.5, 'TL') },
    
    // 2x Tiny Crates
    { id: "lev1-c1", type: "cover", label: "Contenedor", height: 30, platforms: [{height: 30}], points: rect(28, 4, 4, 4) },
    { id: "lev1-c2", type: "cover", label: "Contenedor", height: 30, platforms: [{height: 30}], points: rect(28, 36, 4, 4) }
  ]
}

function makeCombatPatrolTerrain(): Terrain[] {
  // Patrulla (Combat Patrol) 44x30 board
  return [
    // 4x Medium Ruins in corners
    { id: "cp-l1", type: "obscuring", label: "Ruina Media", height: 80, corner: 'BR', platforms: [{height: 80, points: lShape(4, 3, 6, 6, 3, 'BR')}], points: lShape(4, 3, 6, 6, 0.5, 'BR') },
    { id: "cp-l2", type: "obscuring", label: "Ruina Media", height: 80, corner: 'BL', platforms: [{height: 80, points: lShape(34, 3, 6, 6, 3, 'BL')}], points: lShape(34, 3, 6, 6, 0.5, 'BL') },
    { id: "cp-l3", type: "obscuring", label: "Ruina Media", height: 80, corner: 'TR', platforms: [{height: 80, points: lShape(4, 21, 6, 6, 3, 'TR')}], points: lShape(4, 21, 6, 6, 0.5, 'TR') },
    { id: "cp-l4", type: "obscuring", label: "Ruina Media", height: 80, corner: 'TL', platforms: [{height: 80, points: lShape(34, 21, 6, 6, 3, 'TL')}], points: lShape(34, 21, 6, 6, 0.5, 'TL') },
    
    // 2x Central Small Ruins
    { id: "cp-m1", type: "obscuring", label: "Ruina U", height: 80, platforms: [{height: 80, points: uShape(18, 5, 8, 4, 3, 'BOTTOM')}], points: uShape(18, 5, 8, 4, 0.5, 'BOTTOM') },
    { id: "cp-m2", type: "obscuring", label: "Ruina U", height: 80, platforms: [{height: 80, points: uShape(18, 21, 8, 4, 3, 'TOP')}], points: uShape(18, 21, 8, 4, 0.5, 'TOP') },

    // 4x Scattered crates/barrels
    { id: "cp-c1", type: "cover", label: "Contenedor", height: 30, platforms: [{height: 30}], points: rect(12, 13, 4, 4) },
    { id: "cp-c2", type: "cover", label: "Contenedor", height: 30, platforms: [{height: 30}], points: rect(28, 13, 4, 4) },
    { id: "cp-c3", type: "cover", label: "Barriles", height: 15, platforms: [{height: 15}], points: rect(22, 15, 2, 2) },
    { id: "cp-c4", type: "cover", label: "Barriles", height: 15, platforms: [{height: 15}], points: rect(20, 13, 2, 2) }
  ]
}

// 5 Standard WTC Objectives for Strike Force (Crucible of Battle layout etc.)
// A 60x44 board center is (30, 22)
export const WTC_OBJECTIVES = [
    { x: 30, y: 22 }, // Center
    { x: 30, y: 8 },  // Top Mid
    { x: 30, y: 36 }, // Bottom Mid
    { x: 15, y: 22 }, // Left Mid
    { x: 45, y: 22 }  // Right Mid
];

export function getObjectivesForLayout(layoutId: string) {
    if (layoutId === "combat-patrol") {
        return [
            { x: 22, y: 15 }, // Center
            { x: 22, y: 5 },  // Top Mid
            { x: 22, y: 25 }, // Bottom Mid
            { x: 11, y: 15 }, // Left Mid
            { x: 33, y: 15 }  // Right Mid
        ]
    }
    return WTC_OBJECTIVES;
}

function rect(x: number, y: number, w: number, h: number) {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
}

function lShape(x: number, y: number, w: number, h: number, t: number, corner: 'TL' | 'TR' | 'BL' | 'BR') {
  if (corner === 'TL') return [ {x,y}, {x:x+w,y}, {x:x+w,y:y+t}, {x:x+t,y:y+t}, {x:x+t,y:y+h}, {x,y:y+h} ];
  if (corner === 'TR') return [ {x,y}, {x:x+w,y}, {x:x+w,y:y+h}, {x:x+w-t,y:y+h}, {x:x+w-t,y:y+t}, {x,y:y+t} ];
  if (corner === 'BL') return [ {x,y}, {x:x+t,y}, {x:x+t,y:y+h-t}, {x:x+w,y:y+h-t}, {x:x+w,y:y+h}, {x,y:y+h} ];
  return [ {x:x+w-t,y}, {x:x+w,y}, {x:x+w,y:y+h}, {x,y:y+h}, {x,y:y+h-t}, {x:x+w-t,y:y+h-t} ]; // BR
}

function uShape(x: number, y: number, w: number, h: number, t: number, facing: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT') {
  if (facing === 'TOP') return [ {x,y}, {x:x+t,y}, {x:x+t,y:y+h-t}, {x:x+w-t,y:y+h-t}, {x:x+w-t,y}, {x:x+w,y}, {x:x+w,y:y+h}, {x,y:y+h} ];
  if (facing === 'BOTTOM') return [ {x,y}, {x:x+w,y}, {x:x+w,y:y+h}, {x:x+w-t,y:y+h}, {x:x+w-t,y:y+t}, {x:x+t,y:y+t}, {x:x+t,y:y+h}, {x,y:y+h} ];
  if (facing === 'LEFT') return [ {x,y}, {x:x+w,y}, {x:x+w,y:y+h}, {x,y:y+h}, {x,y:y+h-t}, {x:x+w-t,y:y+h-t}, {x:x+w-t,y:y+t}, {x,y:y+t} ];
  return [ {x,y}, {x:x+w,y}, {x:x+w,y:y+t}, {x:x+t,y:y+t}, {x:x+t,y:y+h-t}, {x:x+w,y:y+h-t}, {x:x+w,y:y+h}, {x,y:y+h} ]; // RIGHT
}

/** Objective markers, 40mm ~ measured from center within 3" */
export function makeObjectives() {
  return [
    { id: "obj-c", x: 30, y: 22 },
    { id: "obj-tl", x: 18, y: 12 },
    { id: "obj-br", x: 42, y: 32 },
    { id: "obj-tr", x: 42, y: 12 },
    { id: "obj-bl", x: 18, y: 32 },
  ]
}
