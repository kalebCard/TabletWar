"use client"

import { useCallback, useEffect, useRef } from "react"
import type { GameState, Terrain, Token, Unit } from "@/lib/game/types"
import {
  BOARD_HEIGHT_IN,
  BOARD_WIDTH_IN,
  ENGAGEMENT_RANGE_IN,
  FACTIONS,
  mmToInches,
} from "@/lib/game/constants"
import { baseGap, dist, lineOfSight, type Pt } from "@/lib/game/geometry"

const IMG_BATTLEMAT = typeof window !== 'undefined' ? new Image() : null
if (IMG_BATTLEMAT) IMG_BATTLEMAT.src = '/assets/battlemat.png'

const IMG_RUINS = typeof window !== 'undefined' ? new Image() : null
if (IMG_RUINS) IMG_RUINS.src = '/assets/ruins.png'

const IMG_CRATER = typeof window !== 'undefined' ? new Image() : null
if (IMG_CRATER) IMG_CRATER.src = '/assets/crater.png'

const IMG_FOREST = typeof window !== 'undefined' ? new Image() : null
if (IMG_FOREST) IMG_FOREST.src = '/assets/forest.png'

const IMG_IMPERIUM = typeof window !== 'undefined' ? new Image() : null
if (IMG_IMPERIUM) IMG_IMPERIUM.src = '/assets/token_imperium.png'

const IMG_CHAOS = typeof window !== 'undefined' ? new Image() : null
if (IMG_CHAOS) IMG_CHAOS.src = '/assets/token_chaos.png'

type Tool = "select" | "measure"

interface Props {
  tokens: Token[]
  units: Unit[]
  terrain: Terrain[]
  objectives: { id: string; x: number; y: number }[]
  game: GameState
  tool: Tool
  selectedIds: string[]
  combatTargetId?: string | null
  deployingUnitId?: string | null
  onSelect: (ids: string[]) => void
  onMoveTokens: (moves: { id: string; x: number; y: number }[]) => void
  onDeployUnit?: (id: string, x: number, y: number) => void
  microMoveMode?: { unitId: string, type: "pile-in" | "consolidate" } | null
}

interface Camera {
  scale: number // px per inch
  ox: number // screen offset x
  oy: number
}


function drawUnitIcon(ctx: CanvasRenderingContext2D, name: string, cx: number, cy: number, r: number, faction: string, isDimmed: boolean) {
  const highlight = isDimmed ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.85)"
  const shadow = isDimmed ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.8)"
  
  ctx.save()
  ctx.translate(cx, cy)
  
  // draw base rim shadow
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI*2)
  ctx.fillStyle = shadow
  ctx.fill()
  
  const img = faction === "imperium" ? IMG_IMPERIUM : IMG_CHAOS
  if (img && img.complete) {
    if (isDimmed) ctx.globalAlpha = 0.5
    
    // Circular clipping mask
    ctx.save()
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2)
    ctx.clip()
    
    ctx.drawImage(img, -r, -r, r*2, r*2)
    ctx.restore()
  } else {
    // Fallback abstract drawing if image not loaded
    ctx.fillStyle = faction === "imperium" ? "#1e3a8a" : "#7f1d1d"
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2)
    ctx.fill()
  }

  // Draw highlight rim
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI*2)
  ctx.strokeStyle = highlight
  ctx.lineWidth = 1.5
  ctx.stroke()
  
  ctx.restore()
}

export function BoardCanvas({
  tokens,
  units,
  terrain,
  objectives,
  game,
  tool,
  selectedIds,
  combatTargetId,
  deployingUnitId,
  onSelect,
  onMoveTokens,
  onDeployUnit,
  microMoveMode,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const cam = useRef<Camera>({ scale: 12, ox: 40, oy: 40 })

  // interaction refs
  const pointer = useRef({ down: false, sx: 0, sy: 0, moved: false })
  const panning = useRef(false)
  const dragging = useRef<{ ids: string[]; ox: number; oy: number; starts: Record<string, Pt> } | null>(null)
  const selectionBox = useRef<{ a: Pt; b: Pt } | null>(null)
  const measure = useRef<{ a: Pt; b: Pt } | null>(null)
  const hover = useRef<Pt | null>(null)
  
  // animation ref
  const time = useRef(0)
  const reqRef = useRef<number>(0)

  // keep latest props for the imperative loop
  const state = useRef({ tokens, units, game, tool, selectedIds, combatTargetId, deployingUnitId, onDeployUnit, microMoveMode, terrain, objectives })
  useEffect(() => {
    state.current = { tokens, units, game, tool, selectedIds, combatTargetId, deployingUnitId, onDeployUnit, microMoveMode, terrain, objectives }
  }, [tokens, units, game, tool, selectedIds, combatTargetId, deployingUnitId, onDeployUnit, microMoveMode, terrain, objectives])

  const worldToScreen = (x: number, y: number): Pt => ({
    x: cam.current.ox + x * cam.current.scale,
    y: cam.current.oy + y * cam.current.scale,
  })
  const screenToWorld = (sx: number, sy: number): Pt => ({
    x: (sx - cam.current.ox) / cam.current.scale,
    y: (sy - cam.current.oy) / cam.current.scale,
  })

  const draw = useCallback((now: number = 0) => {
    time.current = now
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.width / dpr
    const h = canvas.height / dpr
    const { scale } = cam.current
    const s = state.current

    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    // deep space radial backdrop
    const bgGrad = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, Math.max(w, h))
    bgGrad.addColorStop(0, "oklch(0.18 0.02 260)")
    bgGrad.addColorStop(1, "oklch(0.12 0.02 260)")
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, w, h)

    const tl = worldToScreen(0, 0)
    const boardW = BOARD_WIDTH_IN * scale
    const boardH = BOARD_HEIGHT_IN * scale

    // glowing board shadow
    ctx.shadowColor = "oklch(0 0 0 / 0.8)"
    ctx.shadowBlur = 40
    ctx.shadowOffsetX = 10
    ctx.shadowOffsetY = 10
    ctx.fillStyle = "oklch(0.22 0.025 260)"
    ctx.fillRect(tl.x, tl.y, boardW, boardH)
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0

    // Draw the battlemat (procedural minimalist neoprene mat)
    ctx.fillStyle = "#1c1c1f"
    ctx.fillRect(cam.current.ox, cam.current.oy, BOARD_WIDTH_IN * scale, BOARD_HEIGHT_IN * scale)
      
    // subtle vignette/border shadow for the mat
    ctx.strokeStyle = "#111113"
    ctx.lineWidth = 10
    ctx.strokeRect(cam.current.ox, cam.current.oy, BOARD_WIDTH_IN * scale, BOARD_HEIGHT_IN * scale)

    // deployment zones
    if (s.game.phase === "deployment") {
      const z1 = worldToScreen(0, 0)
      const z2 = worldToScreen(BOARD_WIDTH_IN - 10, 0)
      ctx.fillStyle = "rgba(0, 150, 255, 0.1)"
      ctx.fillRect(z1.x, z1.y, 10 * scale, boardH)
      ctx.strokeStyle = "rgba(0, 150, 255, 0.5)"
      ctx.strokeRect(z1.x, z1.y, 10 * scale, boardH)
      
      ctx.fillStyle = "rgba(255, 50, 50, 0.1)"
      ctx.fillRect(z2.x, z2.y, 10 * scale, boardH)
      ctx.strokeStyle = "rgba(255, 50, 50, 0.5)"
      ctx.strokeRect(z2.x, z2.y, 10 * scale, boardH)
    }

    // sci-fi grid
    ctx.lineWidth = 1
    for (let i = 0; i <= BOARD_WIDTH_IN; i++) {
      const major = i % 6 === 0
      ctx.strokeStyle = major ? "oklch(0.7 0.15 245 / 0.3)" : "oklch(0.4 0.05 260 / 0.15)"
      if (major && scale > 15) {
        ctx.shadowColor = "oklch(0.7 0.15 245)"
        ctx.shadowBlur = 4
      }
      const p = worldToScreen(i, 0)
      ctx.beginPath()
      ctx.moveTo(p.x, tl.y)
      ctx.lineTo(p.x, tl.y + boardH)
      ctx.stroke()
      ctx.shadowBlur = 0
    }
    for (let j = 0; j <= BOARD_HEIGHT_IN; j++) {
      const major = j % 6 === 0
      ctx.strokeStyle = major ? "oklch(0.7 0.15 245 / 0.3)" : "oklch(0.4 0.05 260 / 0.15)"
      if (major && scale > 15) {
        ctx.shadowColor = "oklch(0.7 0.15 245)"
        ctx.shadowBlur = 4
      }
      const p = worldToScreen(0, j)
      ctx.beginPath()
      ctx.moveTo(tl.x, p.y)
      ctx.lineTo(tl.x + boardW, p.y)
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    // neon board border
    ctx.strokeStyle = "oklch(0.7 0.15 245 / 0.6)"
    ctx.shadowColor = "oklch(0.7 0.15 245)"
    ctx.shadowBlur = 10
    ctx.lineWidth = 2
    ctx.strokeRect(tl.x, tl.y, boardW, boardH)
    ctx.shadowBlur = 0

    // terrain (holographic styling)
    for (const t of s.terrain) {
      const pts = t.points.map((p) => worldToScreen(p.x, p.y))
      ctx.beginPath()
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.closePath()
      
      ctx.save()
      ctx.clip()
      let imgToDraw = null
      if (t.label === "Ruinas") imgToDraw = IMG_RUINS
      else if (t.label === "Cráter") imgToDraw = IMG_CRATER
      else if (t.label === "Bosque") imgToDraw = IMG_FOREST

      if (imgToDraw && imgToDraw.complete) {
        let minX = Math.min(...pts.map(p => p.x))
        let minY = Math.min(...pts.map(p => p.y))
        let maxX = Math.max(...pts.map(p => p.x))
        let maxY = Math.max(...pts.map(p => p.y))
        ctx.drawImage(imgToDraw, minX, minY, maxX - minX, maxY - minY)
      } else {
        const patGrad = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[1]?.x ?? pts[0].x + 100, pts[1]?.y ?? pts[0].y + 100)
        if (t.type === "obscuring") {
          patGrad.addColorStop(0, "oklch(0.3 0.05 260 / 0.5)")
          patGrad.addColorStop(1, "oklch(0.2 0.05 260 / 0.7)")
          ctx.fillStyle = patGrad
        } else if (t.type === "cover") {
          patGrad.addColorStop(0, "oklch(0.4 0.1 160 / 0.3)")
          patGrad.addColorStop(1, "oklch(0.3 0.1 160 / 0.5)")
          ctx.fillStyle = patGrad
        } else {
          patGrad.addColorStop(0, "oklch(0.35 0.05 60 / 0.5)")
          patGrad.addColorStop(1, "oklch(0.25 0.05 60 / 0.7)")
          ctx.fillStyle = patGrad
        }
        ctx.fill()
      }
      ctx.restore()
      
      // Setup stroke for outline
      if (t.type === "obscuring") {
        ctx.strokeStyle = "oklch(0.6 0.1 260 / 0.9)"
        ctx.shadowColor = "oklch(0.6 0.1 260)"
      } else if (t.type === "cover") {
        ctx.strokeStyle = "oklch(0.7 0.15 160 / 0.8)"
        ctx.shadowColor = "oklch(0.7 0.15 160)"
      } else {
        ctx.strokeStyle = "oklch(0.6 0.1 60 / 0.9)"
        ctx.shadowColor = "oklch(0.6 0.1 60)"
      }
      
      ctx.shadowBlur = 8
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.shadowBlur = 0
      
      if (t.label && scale > 8) {
        const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length
        const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length
        ctx.fillStyle = "oklch(0.9 0.02 250 / 0.9)"
        ctx.font = "600 11px var(--font-rajdhani), ui-sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.letterSpacing = "2px"
        ctx.fillText(t.label.toUpperCase(), cx, cy)
        ctx.letterSpacing = "0px"
      }
    }

    // pulsing objective markers
    const pulse = (Math.sin(now / 300) + 1) / 2
    for (const o of s.objectives) {
      const c = worldToScreen(o.x, o.y)
      const rControl = 3 * scale
      // Control zone aura
      const auraGrad = ctx.createRadialGradient(c.x, c.y, rControl * 0.5, c.x, c.y, rControl)
      auraGrad.addColorStop(0, `oklch(0.8 0.13 90 / ${0.03 + pulse * 0.04})`)
      auraGrad.addColorStop(1, "oklch(0.8 0.13 90 / 0)")
      ctx.beginPath()
      ctx.arc(c.x, c.y, rControl, 0, Math.PI * 2)
      ctx.fillStyle = auraGrad
      ctx.fill()
      
      // Control zone dashed ring
      const dashOffset = -now / 40
      ctx.strokeStyle = `oklch(0.8 0.13 90 / ${0.3 + pulse * 0.2})`
      ctx.setLineDash([4, 6])
      ctx.lineDashOffset = dashOffset * 0.5
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.setLineDash([])
      
      // Central marker
      const rMarker = (mmToInches(40) / 2) * scale
      ctx.beginPath()
      ctx.arc(c.x, c.y, rMarker, 0, Math.PI * 2)
      const markerGrad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rMarker)
      markerGrad.addColorStop(0, "oklch(0.95 0.15 90)")
      markerGrad.addColorStop(1, "oklch(0.75 0.15 90)")
      ctx.fillStyle = markerGrad
      ctx.shadowColor = "oklch(0.85 0.15 90)"
      ctx.shadowBlur = 12 + pulse * 8
      ctx.fill()
      ctx.shadowBlur = 0
      
      ctx.strokeStyle = "oklch(0.98 0.15 90)"
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // unit coherency links
    const groups = new Map<string, Token[]>()
    for (const t of s.tokens) {
      if (t.currentWounds > 0) {
        const arr = groups.get(t.unitId) || []
        arr.push(t)
        groups.set(t.unitId, arr)
      }
    }

    for (const members of groups.values()) {
      if (members.length < 2) continue
      for (let i = 0; i < members.length; i++) {
        let hasCoherency = false
        for (let j = 0; j < members.length; j++) {
          if (i === j) continue
          const a = members[i]
          const b = members[j]
          if (baseGap(a, b) <= 2) {
            hasCoherency = true
            if (i < j) { 
              const pa = worldToScreen(a.x, a.y)
              const pb = worldToScreen(b.x, b.y)
              ctx.strokeStyle = "oklch(0.8 0.1 200 / 0.15)"
              ctx.lineWidth = 1.5
              ctx.beginPath()
              ctx.moveTo(pa.x, pa.y)
              ctx.lineTo(pb.x, pb.y)
              ctx.stroke()
            }
          }
        }
        if (!hasCoherency && s.game.phase === "movement") {
          const pa = worldToScreen(members[i].x, members[i].y)
          ctx.beginPath()
          ctx.arc(pa.x, pa.y, (mmToInches(members[i].baseMm) / 2) * scale + 6, 0, Math.PI * 2)
          ctx.strokeStyle = "oklch(0.65 0.22 25 / 0.9)"
          ctx.setLineDash([4, 4])
          ctx.lineDashOffset = -now / 20
          ctx.shadowColor = "oklch(0.65 0.22 25)"
          ctx.shadowBlur = 8
          ctx.lineWidth = 2
          ctx.stroke()
          ctx.shadowBlur = 0
          ctx.setLineDash([])
        }
      }
    }

    // engagement links (enemy bases within 1")
    for (let i = 0; i < s.tokens.length; i++) {
      if (s.tokens[i].currentWounds <= 0) continue
      for (let j = i + 1; j < s.tokens.length; j++) {
        if (s.tokens[j].currentWounds <= 0) continue
        const a = s.tokens[i]
        const b = s.tokens[j]
        if (a.faction === b.faction) continue
        if (baseGap(a, b) <= ENGAGEMENT_RANGE_IN) {
          const pa = worldToScreen(a.x, a.y)
          const pb = worldToScreen(b.x, b.y)
          ctx.strokeStyle = "oklch(0.65 0.22 25 / 0.85)"
          ctx.lineWidth = 2.5
          ctx.setLineDash([6, 4])
          ctx.lineDashOffset = now / 30
          ctx.shadowColor = "oklch(0.65 0.22 25)"
          ctx.shadowBlur = 6
          ctx.beginPath()
          ctx.moveTo(pa.x, pa.y)
          ctx.lineTo(pb.x, pb.y)
          ctx.stroke()
          ctx.shadowBlur = 0
          ctx.setLineDash([])
        }
      }
    }

    // active drag: movement rings + lasers
    const drag = dragging.current
    if (drag && s.game.phase === "movement") {
      let maxDist = Infinity
      for (const id of drag.ids) {
        const tok = s.tokens.find((t) => t.id === id)
        const unit = s.units.find(u => u.id === tok?.unitId)
        if (tok) {
          let m = tok.stats.move
          if (unit?.advanceRoll) m += unit.advanceRoll
          maxDist = Math.min(maxDist, m)
        }
      }
      
      for (const id of drag.ids) {
        const tok = s.tokens.find((t) => t.id === id)
        const start = drag.starts[id]
        if (tok && start) {
          const origin = worldToScreen(start.x, start.y)
          const moveR = maxDist * scale
          
          ctx.beginPath()
          ctx.arc(origin.x, origin.y, moveR, 0, Math.PI * 2)
          ctx.fillStyle = "oklch(0.7 0.15 245 / 0.05)"
          ctx.fill()
          ctx.strokeStyle = "oklch(0.7 0.15 245 / 0.6)"
          ctx.setLineDash([5, 5])
          ctx.lineDashOffset = -now / 40
          ctx.lineWidth = 1.5
          ctx.stroke()
          ctx.setLineDash([])
          
          const cur = worldToScreen(tok.x, tok.y)
          const d = dist({ x: start.x, y: start.y }, { x: tok.x, y: tok.y })
          const over = d > maxDist + 1e-6
          ctx.strokeStyle = over ? "oklch(0.65 0.22 25)" : "oklch(0.7 0.15 245)"
          ctx.shadowColor = ctx.strokeStyle
          ctx.shadowBlur = 8
          ctx.lineWidth = 2
          ctx.setLineDash([10, 5])
          ctx.lineDashOffset = now / 20
          ctx.beginPath()
          ctx.moveTo(origin.x, origin.y)
          ctx.lineTo(cur.x, cur.y)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.shadowBlur = 0
          
          if (drag.ids.length === 1 || id === drag.ids[0]) {
            drawLabel(ctx, (origin.x + cur.x) / 2, (origin.y + cur.y) / 2, `${d.toFixed(1)}"`, over)
          }
        }
      }
    }
    
    if (selectionBox.current) {
      const a = worldToScreen(selectionBox.current.a.x, selectionBox.current.a.y)
      const b = worldToScreen(selectionBox.current.b.x, selectionBox.current.b.y)
      ctx.fillStyle = "oklch(0.7 0.15 245 / 0.15)"
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y)
      ctx.strokeStyle = "oklch(0.7 0.15 245 / 0.8)"
      ctx.lineWidth = 1
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)
    }

    // shooting LoS preview
    const primarySelectedId = s.selectedIds[0]
    if (s.game.phase === "shooting" && primarySelectedId && hover.current) {
      const shooter = s.tokens.find((t) => t.id === primarySelectedId)
      const target = pickToken(s.tokens, hover.current)
      if (shooter && target && target.faction !== shooter.faction) {
        const los = lineOfSight(shooter, target, s.terrain)
        const ps = worldToScreen(shooter.x, shooter.y)
        const pt = worldToScreen(target.x, target.y)
        ctx.strokeStyle = los.blocked ? "oklch(0.65 0.22 25)" : "oklch(0.5 0.25 150)"
        ctx.shadowColor = ctx.strokeStyle
        ctx.shadowBlur = 10
        ctx.lineWidth = 2
        ctx.setLineDash(los.blocked ? [4, 4] : [15, 5])
        ctx.lineDashOffset = now / 15
        ctx.beginPath()
        ctx.moveTo(ps.x, ps.y)
        ctx.lineTo(pt.x, pt.y)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.shadowBlur = 0
        drawLabel(
          ctx,
          (ps.x + pt.x) / 2,
          (ps.y + pt.y) / 2,
          los.blocked ? `${los.distance.toFixed(1)}" · BLOQUEADO` : `${los.distance.toFixed(1)}"`,
          los.blocked,
        )
      }
    }

    // committed combat target line
    if (s.combatTargetId && primarySelectedId && (s.game.phase === "shooting" || s.game.phase === "fight")) {
      const shooter = s.tokens.find((t) => t.id === primarySelectedId)
      const target = s.tokens.find((t) => t.id === s.combatTargetId)
      if (shooter && target) {
        const los = lineOfSight(shooter, target, s.terrain)
        const ps = worldToScreen(shooter.x, shooter.y)
        const pt = worldToScreen(target.x, target.y)
        const melee = s.game.phase === "fight"
        const bad = !melee && los.blocked
        ctx.strokeStyle = bad ? "oklch(0.65 0.22 25)" : "oklch(0.8 0.2 60)"
        ctx.shadowColor = ctx.strokeStyle
        ctx.shadowBlur = 12
        ctx.lineWidth = 3
        ctx.setLineDash(bad ? [4, 4] : [10, 5])
        ctx.lineDashOffset = now / 10
        ctx.beginPath()
        ctx.moveTo(ps.x, ps.y)
        ctx.lineTo(pt.x, pt.y)
        ctx.stroke()
        ctx.setLineDash([])
        
        // pulsing target reticle
        const reticlePulse = (Math.sin(now / 150) + 1) / 2
        const tr = (mmToInches(target.baseMm) / 2) * scale + 5 + (reticlePulse * 2)
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, tr, 0, Math.PI * 2)
        ctx.strokeStyle = "oklch(0.65 0.22 25)"
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.shadowBlur = 0
        
        drawLabel(
          ctx,
          (ps.x + pt.x) / 2,
          (ps.y + pt.y) / 2,
          bad ? `${los.distance.toFixed(1)}" · BLOQUEADO` : `${los.distance.toFixed(1)}"`,
          bad,
        )
      }
    }

    // free measure
    if (s.tool === "measure" && measure.current) {
      const a = worldToScreen(measure.current.a.x, measure.current.a.y)
      const b = worldToScreen(measure.current.b.x, measure.current.b.y)
      const d = dist(measure.current.a, measure.current.b)
      ctx.strokeStyle = "oklch(0.7 0.15 245)"
      ctx.shadowColor = "oklch(0.7 0.15 245)"
      ctx.shadowBlur = 8
      ctx.lineWidth = 2
      ctx.setLineDash([8, 4])
      ctx.lineDashOffset = now / 20
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.shadowBlur = 0
      
      for (const p of [a, b]) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
        ctx.fillStyle = "oklch(0.7 0.15 245)"
        ctx.shadowColor = ctx.fillStyle
        ctx.shadowBlur = 10
        ctx.fill()
        ctx.shadowBlur = 0
      }
      drawLabel(ctx, (a.x + b.x) / 2, (a.y + b.y) / 2, `${d.toFixed(1)}"`, false)
    }

    // premium 3D tokens
    for (const t of s.tokens) {
      if (t.embarkedIn) continue
      const c = worldToScreen(t.x, t.y)
      const r = (mmToInches(t.baseMm) / 2) * scale
      const fac = FACTIONS[t.faction]
      const isSel = s.selectedIds.includes(t.id)
      const isActive = t.faction === s.game.activePlayer

      // dynamic drop shadow
      ctx.beginPath()
      ctx.arc(c.x, c.y + 3, r, 0, Math.PI * 2)
      ctx.fillStyle = "oklch(0 0 0 / 0.6)"
      ctx.shadowColor = "oklch(0 0 0 / 0.5)"
      ctx.shadowBlur = 6
      ctx.shadowOffsetY = 4
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0

      // base gradient (metallic/3D effect)
      const isDimmed = !isActive && s.game.phase === "movement"
      const colorSoft = isDimmed ? "oklch(0.3 0.05 260)" : fac.colorSoft
      const colorMain = isDimmed ? "oklch(0.2 0.05 260)" : fac.color
      
      const tokGrad = ctx.createLinearGradient(c.x - r, c.y - r, c.x + r, c.y + r)
      tokGrad.addColorStop(0, colorSoft)
      tokGrad.addColorStop(1, colorMain)
      
      ctx.beginPath()
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
      ctx.fillStyle = tokGrad
      ctx.fill()
      
      // inner rim highlight
      ctx.beginPath()
      ctx.arc(c.x, c.y, r - 1.5, 0, Math.PI * 2)
      ctx.strokeStyle = "oklch(1 0 0 / 0.15)"
      ctx.lineWidth = 1.5
      ctx.stroke()

      // outer rim border
      ctx.beginPath()
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
      ctx.lineWidth = isSel ? 3 : 1.5
      ctx.strokeStyle = isSel ? "oklch(0.95 0.02 250)" : "oklch(0.1 0 0 / 0.8)"
      if (isSel) {
        ctx.shadowColor = "oklch(0.95 0.02 250)"
        ctx.shadowBlur = 12
      }
      ctx.stroke()
      ctx.shadowBlur = 0

      // selection pulsing halo
      if (isSel) {
        const selPulse = (Math.sin(now / 200) + 1) / 2
        ctx.beginPath()
        ctx.arc(c.x, c.y, r + 4 + (selPulse * 2), 0, Math.PI * 2)
        ctx.strokeStyle = `oklch(0.95 0.02 250 / ${0.4 + selPulse * 0.3})`
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // wounds arc
      if (t.currentWounds < t.stats.wounds) {
        const frac = t.currentWounds / t.stats.wounds
        ctx.beginPath()
        ctx.arc(c.x, c.y, r + 3, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2)
        ctx.strokeStyle = "oklch(0.65 0.22 25)"
        ctx.shadowColor = "oklch(0.65 0.22 25)"
        ctx.shadowBlur = 6
        ctx.lineWidth = 2.5
        ctx.stroke()
        ctx.shadowBlur = 0
      }

      // modern visual representation
      if (scale > 5) {
        drawUnitIcon(ctx, t.name, c.x, c.y, r, t.faction, isDimmed)
      }
    }

    ctx.restore()
  }, [])

  // animation loop
  useEffect(() => {
    let active = true
    const loop = (t: number) => {
      if (!active) return
      draw(t)
      reqRef.current = requestAnimationFrame(loop)
    }
    reqRef.current = requestAnimationFrame(loop)
    return () => {
      active = false
      cancelAnimationFrame(reqRef.current)
    }
  }, [draw])

  // handle resize
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = wrap.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      // no need to manually call draw, animation loop handles it
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  const localPoint = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    canvasRef.current?.setPointerCapture(e.pointerId)
    const { sx, sy } = localPoint(e)
    pointer.current = { down: true, sx, sy, moved: false }
    const world = screenToWorld(sx, sy)

    if (state.current.tool === "measure") {
      measure.current = { a: world, b: world }
      return
    }

    if (state.current.game.phase === "deployment" && state.current.deployingUnitId && state.current.onDeployUnit) {
      let valid = false
      if (state.current.game.activePlayer === "imperium" && world.x <= 10) valid = true
      if (state.current.game.activePlayer === "chaos" && world.x >= BOARD_WIDTH_IN - 10) valid = true
      
      if (valid) {
        state.current.onDeployUnit(state.current.deployingUnitId, world.x, world.y)
      } else {
        alert("Debes desplegar dentro de tu zona de despliegue (a 10\" del borde de tu mesa).")
      }
      return
    }

    const hit = state.current.tokens.find((t) => !t.embarkedIn && dist(world, { x: t.x, y: t.y }) <= mmToInches(t.baseMm) / 2)
    const g = state.current.game
    if (hit) {
      let newSel = [...state.current.selectedIds]
      if (e.shiftKey) {
        if (newSel.includes(hit.id)) {
          newSel = newSel.filter((id) => id !== hit.id)
        } else {
          newSel.push(hit.id)
        }
      } else {
        if (!newSel.includes(hit.id)) {
          newSel = [hit.id]
        }
      }
      onSelect(newSel)
      
      let canMove = false
      if (state.current.microMoveMode) {
        canMove = hit.unitId === state.current.microMoveMode.unitId
      } else {
        canMove = g.phase === "movement" && hit.faction === g.activePlayer && !hit.moved
      }
      
      if (canMove) {
        const starts: Record<string, Pt> = {}
        for (const id of newSel) {
          const t = state.current.tokens.find((tok) => tok.id === id)
          if (t && (state.current.microMoveMode?.unitId === t.unitId || (t.faction === g.activePlayer && !t.moved))) {
            starts[id] = { x: t.x, y: t.y }
          }
        }
        dragging.current = { ids: Object.keys(starts), ox: world.x, oy: world.y, starts }
      }
    } else {
      if (e.shiftKey) {
        selectionBox.current = { a: world, b: world }
      } else {
        panning.current = true
      }
      if (!e.shiftKey && state.current.selectedIds.length > 0) {
        onSelect([])
      }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const { sx, sy } = localPoint(e)
    const world = screenToWorld(sx, sy)
    hover.current = world

    if (!pointer.current.down) {
      return
    }
    const dx = sx - pointer.current.sx
    const dy = sy - pointer.current.sy
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) pointer.current.moved = true

    if (state.current.tool === "measure" && measure.current) {
      measure.current.b = world
      return
    }

    if (selectionBox.current) {
      selectionBox.current.b = world
      const minX = Math.min(selectionBox.current.a.x, selectionBox.current.b.x)
      const maxX = Math.max(selectionBox.current.a.x, selectionBox.current.b.x)
      const minY = Math.min(selectionBox.current.a.y, selectionBox.current.b.y)
      const maxY = Math.max(selectionBox.current.a.y, selectionBox.current.b.y)
      
      const newSel = state.current.tokens
        .filter((t) => !t.embarkedIn && t.x >= minX && t.x <= maxX && t.y >= minY && t.y <= maxY)
        .map((t) => t.id)
      onSelect(newSel)
      return
    }

    const drag = dragging.current
    if (drag) {
      let ddx = world.x - drag.ox
      let ddy = world.y - drag.oy
      
      let maxDist = Infinity
      const tokensToMove = []
      for (const id of drag.ids) {
        const tok = state.current.tokens.find((t) => t.id === id)
        if (tok) {
          const u = state.current.units.find(u => u.id === tok.unitId)
          let m = tok.stats.move
          if (state.current.microMoveMode) {
            m = 3
          } else {
            if (u?.advanceRoll) m += u.advanceRoll
          }
          maxDist = Math.min(maxDist, m)
          tokensToMove.push(tok)
        }
      }
      
      const dist = Math.hypot(ddx, ddy)
      if (dist > maxDist) {
        ddx = (ddx / dist) * maxDist
        ddy = (ddy / dist) * maxDist
      }
      
      const moves = []
      let valid = true
      for (const tok of tokensToMove) {
        const start = drag.starts[tok.id]
        if (start) {
          let nx = start.x + ddx
          let ny = start.y + ddy
          const rIn = mmToInches(tok.baseMm) / 2
          nx = Math.max(rIn, Math.min(BOARD_WIDTH_IN - rIn, nx))
          ny = Math.max(rIn, Math.min(BOARD_HEIGHT_IN - rIn, ny))
          
          if (!state.current.microMoveMode && state.current.game.phase === "movement") {
            const enemy = state.current.tokens.find(t => t.faction !== tok.faction && t.currentWounds > 0 && Math.hypot(t.x - nx, t.y - ny) - (t.baseMm / 25.4 / 2) - rIn <= ENGAGEMENT_RANGE_IN)
            if (enemy) valid = false
          }
          moves.push({ id: tok.id, x: nx, y: ny })
        }
      }
      
      if (valid && moves.length > 0) {
        onMoveTokens(moves)
      }
      return
    }

    if (panning.current) {
      cam.current.ox += dx
      cam.current.oy += dy
      pointer.current.sx = sx
      pointer.current.sy = sy
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    canvasRef.current?.releasePointerCapture(e.pointerId)
    pointer.current.down = false
    dragging.current = null
    panning.current = false
    selectionBox.current = null
  }

  const onWheel = (e: React.WheelEvent) => {
    const { sx, sy } = localPoint(e as unknown as React.PointerEvent)
    const before = screenToWorld(sx, sy)
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
    cam.current.scale = Math.max(5, Math.min(40, cam.current.scale * factor))
    const after = screenToWorld(sx, sy)
    cam.current.ox += (after.x - before.x) * cam.current.scale
    cam.current.oy += (after.y - before.y) * cam.current.scale
  }

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        className={tool === "measure" ? "cursor-crosshair touch-none" : "cursor-grab touch-none active:cursor-grabbing"}
      />
    </div>
  )
}

function pickToken(tokens: Token[], world: Pt): Token | null {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]
    const r = mmToInches(t.baseMm) / 2
    if (dist({ x: t.x, y: t.y }, world) <= r) return t
  }
  return null
}

function drawLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, danger: boolean) {
  ctx.font = "700 13px var(--font-rajdhani), ui-monospace, monospace"
  const padX = 8
  const wText = ctx.measureText(text).width
  const boxW = wText + padX * 2
  const boxH = 22
  
  // glassmorphic pill background
  ctx.fillStyle = danger ? "oklch(0.2 0.05 25 / 0.8)" : "oklch(0.2 0.05 260 / 0.8)"
  ctx.shadowColor = "oklch(0 0 0 / 0.5)"
  ctx.shadowBlur = 8
  roundRect(ctx, x - boxW / 2, y - boxH / 2 - 16, boxW, boxH, 6)
  ctx.fill()
  
  // glowing border
  ctx.strokeStyle = danger ? "oklch(0.65 0.22 25 / 0.8)" : "oklch(0.7 0.15 245 / 0.8)"
  ctx.lineWidth = 1.5
  ctx.shadowBlur = 0
  ctx.stroke()
  
  // text
  ctx.fillStyle = danger ? "oklch(0.9 0.08 25)" : "oklch(0.95 0.05 245)"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(text, x, y - 16)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
