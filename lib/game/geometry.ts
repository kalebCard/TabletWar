import type { Terrain, Token } from "./types"
import { mmToInches, ENGAGEMENT_RANGE_IN } from "./constants"

export interface Pt {
  x: number
  y: number
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Edge-to-edge distance between two bases, in inches. Clamped at 0. */
export function baseGap(a: Token, b: Token): number {
  const centerGap = dist(a, b)
  const radii = mmToInches(a.baseMm) / 2 + mmToInches(b.baseMm) / 2
  return Math.max(0, centerGap - radii)
}

export function inEngagementRange(a: Token, b: Token): boolean {
  return baseGap(a, b) <= ENGAGEMENT_RANGE_IN
}

/** Segment/segment intersection test. */
function segmentsIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const d1 = d(p3, p4, p1)
  const d2 = d(p3, p4, p2)
  const d3 = d(p1, p2, p3)
  const d4 = d(p1, p2, p4)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }
  return false
}

/** Does a sightline segment cross a terrain polygon's edges? */
export function segmentCrossesPolygon(a: Pt, b: Pt, poly: Pt[]): boolean {
  for (let i = 0; i < poly.length; i++) {
    const c = poly[i]
    const d = poly[(i + 1) % poly.length]
    if (segmentsIntersect(a, b, c, d)) return true
  }
  return false
}

export interface LosResult {
  blocked: boolean
  blockingTerrainId?: string
  distance: number
}

export function lineOfSight(shooter: Token, target: Token, terrain: Terrain[]): LosResult {
  const distance = baseGap(shooter, target)
  const sp: Pt = { x: shooter.x, y: shooter.y }
  const tp: Pt = { x: target.x, y: target.y }
  
  for (const t of terrain) {
    if (t.type !== "obscuring") continue
    // A model on/inside the terrain footprint can always be seen into or out of
    if (pointInPolygon(sp, t.points) || pointInPolygon(tp, t.points)) {
      continue 
    }
    // If neither is inside, but the line crosses the boundary, it's blocked.
    if (segmentCrossesPolygon(shooter, target, t.points)) {
      return { blocked: true, blockingTerrainId: t.id, distance }
    }
  }
  return { blocked: false, distance }
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x
    const yi = poly[i].y
    const xj = poly[j].x
    const yj = poly[j].y
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}
