"use client"

import { useMemo, useState } from "react"
import { DATASHEETS, uid } from "@/lib/game/constants"
import type { GameState, RosterUnit, FactionId } from "@/lib/game/types"

interface Props {
  game: GameState
  roster: RosterUnit[]
  onUpdateRoster: (roster: RosterUnit[]) => void
  onComplete: () => void
  onChangePointsLimit?: (limit: number) => void
  onChangeTerrainLayout?: (layout: string) => void
}

export function RosterBuilder({ game, roster, onUpdateRoster, onComplete, onChangePointsLimit, onChangeTerrainLayout }: Props) {
  const [activeTab, setActiveTab] = useState<FactionId>("imperium")
  const [mobileSubTab, setMobileSubTab] = useState<"available" | "selected">("available")

  const imperiumPoints = useMemo(() => {
    return roster.filter(u => u.faction === "imperium").reduce((sum, u) => {
      const ds = DATASHEETS.find((d) => d.id === u.datasheetId)
      return sum + (ds?.points || 0)
    }, 0)
  }, [roster])

  const chaosPoints = useMemo(() => {
    return roster.filter(u => u.faction === "chaos").reduce((sum, u) => {
      const ds = DATASHEETS.find((d) => d.id === u.datasheetId)
      return sum + (ds?.points || 0)
    }, 0)
  }, [roster])

  const addUnit = (dsId: string, faction: FactionId) => {
    const ds = DATASHEETS.find(d => d.id === dsId)
    if (!ds) return
    const pts = faction === "imperium" ? imperiumPoints : chaosPoints
    if (pts + ds.points > game.pointsLimit) {
      alert("Supera el limite de " + game.pointsLimit + " pts para este bando!")
      return
    }
    onUpdateRoster([...roster, { id: uid("roster"), datasheetId: ds.id, faction, deployed: false }])
  }

  const removeUnit = (id: string) => onUpdateRoster(roster.filter(u => u.id !== id))

  const loadDefaultRoster = () => {
    const impDS = DATASHEETS.filter(d => d.faction === "imperium")
    const chDS = DATASHEETS.filter(d => d.faction === "chaos")
    onUpdateRoster([
      ...impDS.slice(0, 2).map(ds => ({ id: uid("roster"), datasheetId: ds.id, faction: "imperium" as FactionId, deployed: false })),
      ...chDS.slice(0, 2).map(ds => ({ id: uid("roster"), datasheetId: ds.id, faction: "chaos" as FactionId, deployed: false }))
    ])
  }

  const availableDS = DATASHEETS.filter(d => d.faction === activeTab)
  const selectedUnits = roster.filter(u => u.faction === activeTab)
  const factionPts = selectedUnits.reduce((s, u) => s + (DATASHEETS.find(d => d.id === u.datasheetId)?.points || 0), 0)
  const impOver = imperiumPoints > game.pointsLimit
  const chaosOver = chaosPoints > game.pointsLimit

  return (
    /* Centered floating modal — map visible behind */
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 pointer-events-none">

      {/* Modal window */}
      <div className="relative flex w-full max-w-3xl max-h-[90vh] flex-col rounded-2xl border border-white/15 bg-[#050505] shadow-[0_0_80px_rgba(0,150,255,0.15)] overflow-hidden pointer-events-auto">

        {/* Glowing top border accent */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-neutral-900 px-5 py-4 shrink-0">
          <div>
            <h1 className="font-mono text-base font-bold uppercase tracking-widest text-foreground">
              Configuracion de Partida
            </h1>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
              Elige mapa, modo de juego y prepara los ejercitos antes de la batalla.
            </p>
          </div>

          {/* Points summary + CTA */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden sm:block">
              <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Puntos</div>
              <div className="font-mono text-lg font-black leading-none">
                <span className={impOver ? "text-destructive" : "text-primary"}>{imperiumPoints}</span>
                <span className="text-muted-foreground/40 mx-1 text-sm">vs</span>
                <span className={chaosOver ? "text-destructive" : "text-red-400"}>{chaosPoints}</span>
                <span className="text-muted-foreground/40 text-sm ml-1">/ {game.pointsLimit}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Settings bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-neutral-900 px-5 py-2.5 shrink-0">
          {/* Terrain */}
          <div className="flex rounded-lg overflow-hidden border border-white/10 bg-neutral-900 text-[10px]">
            {(["custom", "leviathan-1", "combat-patrol"] as const).map((l, i) => (
              <button key={l} onClick={() => onChangeTerrainLayout && onChangeTerrainLayout(l)}
                className={`px-3 py-1.5 font-mono font-bold transition-colors ${game.terrainLayout === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-white/10"}`}
              >{i === 0 ? "Estandar" : i === 1 ? "Leviatan #1" : "Patrulla"}</button>
            ))}
          </div>

          {/* Points limit */}
          <div className="flex rounded-lg overflow-hidden border border-white/10 bg-neutral-900 text-[10px]">
            {[500, 1000, 2000].map(lim => (
              <button key={lim} onClick={() => onChangePointsLimit && onChangePointsLimit(lim)}
                className={`px-3 py-1.5 font-mono font-bold transition-colors ${game.pointsLimit === lim ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-white/10"}`}
              >{lim} pts</button>
            ))}
          </div>

          {/* Mobile points */}
          <div className="sm:hidden ml-auto font-mono text-xs font-bold">
            <span className={impOver ? "text-destructive" : "text-primary"}>{imperiumPoints}</span>
            <span className="text-muted-foreground/40 mx-1">vs</span>
            <span className={chaosOver ? "text-destructive" : "text-red-400"}>{chaosPoints}</span>
            <span className="text-muted-foreground/40">/{game.pointsLimit}</span>
          </div>
        </div>

        {/* Faction tabs */}
        <div className="flex border-b border-white/10 shrink-0">
          <button onClick={() => setActiveTab("imperium")}
            className={`flex-1 py-2.5 font-mono text-xs font-bold uppercase tracking-widest transition-all ${activeTab === "imperium" ? "bg-primary/15 text-primary border-b-2 border-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}
          >
            Imperio — {imperiumPoints} pts
          </button>
          <button onClick={() => setActiveTab("chaos")}
            className={`flex-1 py-2.5 font-mono text-xs font-bold uppercase tracking-widest transition-all ${activeTab === "chaos" ? "bg-destructive/15 text-destructive border-b-2 border-destructive" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}
          >
            Caos — {chaosPoints} pts
          </button>
        </div>

        {/* Mobile sub-tab */}
        <div className="flex md:hidden border-b border-white/10 bg-neutral-900 shrink-0 text-[10px]">
          {(["available", "selected"] as const).map(st => (
            <button key={st} onClick={() => setMobileSubTab(st)}
              className={`flex-1 py-1.5 font-mono font-bold uppercase tracking-wider ${mobileSubTab === st ? "bg-white/10 text-foreground border-b-2 border-white/50" : "text-muted-foreground"}`}
            >
              {st === "available" ? "Disponibles" : "Lista (" + selectedUnits.length + ")"}
            </button>
          ))}
        </div>

        {/* Content columns */}
        <div className="flex min-h-0 flex-1 overflow-hidden">

          {/* Available catalog */}
          <div className={`flex-col border-r border-white/10 overflow-y-auto w-full md:w-1/2 bg-neutral-950 ${mobileSubTab === "available" ? "flex" : "hidden md:flex"}`}>
            <div className="p-4">
              <p className="mb-3 font-mono text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Catalogo de Unidades</p>
              <div className="grid gap-2">
                {availableDS.map(ds => (
                  <div key={ds.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2.5 hover:bg-white/8 hover:border-white/10 transition-all group">
                    <div className="min-w-0">
                      <div className="font-sans text-sm font-bold text-foreground">{ds.name}</div>
                      <div className="font-mono text-[9px] text-muted-foreground">{ds.models.length} {ds.models.length === 1 ? "miniatura" : "miniaturas"}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-2">
                      <span className="font-mono text-sm font-black text-primary">{ds.points} <span className="text-[9px] font-normal text-muted-foreground">pts</span></span>
                      <button onClick={() => addUnit(ds.id, activeTab)}
                        className="h-7 w-7 flex items-center justify-center rounded-lg border border-primary/30 bg-primary/10 font-bold text-primary hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all active:scale-95 group-hover:shadow-[0_0_8px_rgba(0,150,255,0.3)]"
                      >+</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Selected roster */}
          <div className={`flex-col bg-neutral-900 overflow-y-auto w-full md:w-1/2 ${mobileSubTab === "selected" ? "flex" : "hidden md:flex"}`}>
            <div className="p-4">
              <p className="mb-3 font-mono text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                Lista de {activeTab === "imperium" ? "Imperio" : "Caos"} — {factionPts} / {game.pointsLimit} pts
              </p>
              {selectedUnits.length === 0 ? (
                <div className="flex h-24 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center font-mono text-[10px] text-muted-foreground/50">
                  <span className="text-2xl opacity-30">+</span>
                  Sin unidades
                </div>
              ) : (
                <div className="grid gap-2">
                  {selectedUnits.map(u => {
                    const ds = DATASHEETS.find(d => d.id === u.datasheetId)
                    return (
                      <div key={u.id} className="flex items-center justify-between rounded-xl border border-white/8 bg-neutral-800 px-3 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`h-2 w-2 rounded-full shrink-0 ${activeTab === "imperium" ? "bg-primary shadow-[0_0_4px_rgba(0,150,255,0.8)]" : "bg-destructive shadow-[0_0_4px_rgba(255,50,50,0.8)]"}`} />
                          <span className="font-sans text-sm font-bold truncate">{ds?.name}</span>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="font-mono text-sm font-black text-muted-foreground">{ds?.points}</span>
                          <button onClick={() => removeUnit(u.id)}
                            className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                          >
                            <svg width="11" height="11" viewBox="0 0 15 15" fill="none"><path d="M4.5 4.5L10.5 10.5M10.5 4.5L4.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/></svg>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-white/10 bg-neutral-950 px-5 py-4 shrink-0">
          {roster.length === 0 && (
            <button onClick={loadDefaultRoster}
              className="rounded-xl border border-orange-500/40 bg-orange-500/15 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-orange-400 hover:bg-orange-500/25 transition-all active:scale-95"
            >
              Cargar Ejemplo
            </button>
          )}
          <div className="flex-1" />
          <div className="font-mono text-xs text-muted-foreground hidden sm:block">
            {roster.length} unidad{roster.length !== 1 ? "es" : ""} seleccionada{roster.length !== 1 ? "s" : ""}
          </div>
          <button
            onClick={onComplete}
            disabled={roster.length === 0}
            className="rounded-xl border border-primary/50 bg-primary/20 px-6 py-2.5 font-mono text-sm font-bold uppercase tracking-widest text-primary shadow-[0_0_20px_rgba(0,150,255,0.2)] transition-all hover:bg-primary hover:text-primary-foreground hover:shadow-[0_0_30px_rgba(0,150,255,0.4)] disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
          >
            Comenzar Despliegue
          </button>
        </div>
      </div>
    </div>
  )
}
