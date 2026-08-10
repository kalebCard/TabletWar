"use client"

import type { Token, Unit } from "@/lib/game/types"
import { FACTIONS, mmToInches } from "@/lib/game/constants"
import { Button } from "@/components/ui/button"

interface Props {
  token: Token | null
  unit: Unit | null
  onWound: (id: string, d: number) => void
  onAdvance?: (unitId: string) => void
  onFallBack?: (unitId: string) => void
  onMicroMove?: (unitId: string, type: "pile-in" | "consolidate") => void
  onEmbark?: (unitId: string) => void
  onDisembark?: (unitId: string) => void
  microMoveMode?: { unitId: string, type: "pile-in" | "consolidate" } | null
  phase?: string
  inEngagementRange?: boolean
  canEmbark?: boolean
  activePlayer?: string
  onActivate?: (id: string) => void
}

export function UnitPanel({ token, unit, onWound, onAdvance, onFallBack, onMicroMove, onEmbark, onDisembark, microMoveMode, phase, inEngagementRange, canEmbark, activePlayer, onActivate }: Props) {
  if (!token || !unit) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center bg-black/10">
        <div className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-primary drop-shadow-md">Ninguna unidad seleccionada</div>
        <p className="max-w-[16rem] text-pretty text-[13px] leading-relaxed text-muted-foreground/80 font-sans">
          Toca una miniatura para inspeccionar su ficha. Durante la fase de Movimiento, arrastra las miniaturas activas dentro de su rango de movimiento.
        </p>
      </div>
    )
  }

  const fac = FACTIONS[token.faction]
  const effectiveOc = unit.isBattleShocked ? 0 : token.stats.oc
  
  const stats: { label: string; value: string }[] = [
    { label: "M", value: `${token.stats.move}"` },
    { label: "T", value: `${token.stats.toughness}` },
    { label: "SV", value: `${token.stats.save}+` },
    ...(token.stats.invuln ? [{ label: "INV", value: `${token.stats.invuln}++` }] : []),
    { label: "W", value: `${token.stats.wounds}` },
    { label: "LD", value: `${token.stats.leadership}+` },
    { label: "OC", value: `${effectiveOc}` },
    ...(token.stats.fnp ? [{ label: "FNP", value: `${token.stats.fnp}+` }] : [])
  ]



  return (
    <div className="flex h-full flex-col p-6 bg-black/10">
      <div className="flex items-center gap-4">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl font-mono text-base font-black shadow-lg"
          style={{ 
            background: `linear-gradient(135deg, ${fac.colorSoft}, ${fac.color})`, 
            color: "oklch(0.98 0 0)",
            boxShadow: `0 0 15px ${fac.colorSoft}, inset 0 0 10px rgba(0,0,0,0.5)`,
            textShadow: "0 2px 4px rgba(0,0,0,0.5)"
          }}
        >
          {token.name
            .split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </div>
        <div>
          <h2 className="text-balance font-sans text-xl font-bold leading-tight text-foreground drop-shadow-sm">
            {token.name}
          </h2>
          <span className="font-mono text-[11px] font-bold uppercase tracking-widest drop-shadow-sm" style={{ color: fac.color }}>
            {fac.name} · {unit.name}
          </span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 sm:grid-cols-6 gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className={`flex flex-col items-center rounded-lg border shadow-inner ${s.label === 'OC' && unit.isBattleShocked ? 'border-destructive/50 bg-destructive/10 shadow-[inset_0_0_10px_rgba(255,0,0,0.2)]' : 'border-white/10 bg-white/5'} py-2.5`}
          >
            <span className={`font-mono text-[10px] font-bold uppercase tracking-wider ${s.label === 'OC' && unit.isBattleShocked ? 'text-destructive' : 'text-muted-foreground'}`}>{s.label}</span>
            <span className={`font-sans text-base font-black tabular-nums ${s.label === 'OC' && unit.isBattleShocked ? 'text-destructive drop-shadow-md' : 'text-foreground'}`}>{s.value}</span>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Heridas</span>
          <span className="font-sans text-sm font-bold tabular-nums text-foreground">
            {token.currentWounds} / {token.stats.wounds}
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/40 shadow-inner">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${(token.currentWounds / token.stats.wounds) * 100}%`,
              background: token.currentWounds / token.stats.wounds > 0.4 ? `linear-gradient(90deg, ${fac.colorSoft}, ${fac.color})` : "linear-gradient(90deg, oklch(0.5 0.2 25), oklch(0.65 0.2 25))",
              boxShadow: `0 0 10px ${token.currentWounds / token.stats.wounds > 0.4 ? fac.colorSoft : "oklch(0.65 0.2 25)"}`
            }}
          />
        </div>
        <div className="mt-3 flex gap-3">
          <Button
            variant="outline"
            size="sm"
            className="h-9 flex-1 border-white/20 bg-white/5 font-mono text-[12px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
            onClick={() => onWound(token.id, -1)}
          >
            Sufrir Herida
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 flex-1 border-white/20 bg-white/5 font-mono text-[12px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
            onClick={() => onWound(token.id, 1)}
          >
            Curar
          </Button>
        </div>
      </div>

      {phase === "movement" && (
        <div className="mt-4 flex gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={token.moved || unit.advanced || unit.fellBack || !!inEngagementRange}
            className="h-9 flex-1 border-white/20 bg-primary/10 font-mono text-[12px] font-bold uppercase tracking-widest text-primary hover:bg-primary/20 hover:text-primary-foreground transition-colors"
            onClick={() => onAdvance?.(unit.id)}
          >
            Avanzar
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={token.moved || unit.advanced || unit.fellBack || !inEngagementRange}
            className="h-9 flex-1 border-white/20 bg-destructive/10 font-mono text-[12px] font-bold uppercase tracking-widest text-destructive hover:bg-destructive/20 hover:text-destructive-foreground transition-colors"
            onClick={() => onFallBack?.(unit.id)}
          >
            Retirarse
          </Button>
        </div>
      )}



      {phase === "movement" && (unit.transportCapacity ?? 0) > 0 && (unit.embarkedUnits?.length ?? 0) > 0 && (
        <div className="mt-4 flex gap-3">
          <Button
            variant="outline"
            size="sm"
            className="h-9 flex-1 border-white/20 bg-primary/10 font-mono text-[12px] font-bold uppercase tracking-widest text-primary hover:bg-primary/20 hover:text-primary-foreground transition-colors"
            onClick={() => onDisembark?.(unit.id)}
          >
            Desembarcar Pasajeros
          </Button>
        </div>
      )}

      {phase === "movement" && canEmbark && (
        <div className="mt-4 flex gap-3">
          <Button
            variant="outline"
            size="sm"
            className="h-9 flex-1 border-white/20 bg-primary/10 font-mono text-[12px] font-bold uppercase tracking-widest text-primary hover:bg-primary/20 hover:text-primary-foreground transition-colors"
            onClick={() => onEmbark?.(unit.id)}
          >
            Embarcar en Transporte
          </Button>
        </div>
      )}

      {phase === "fight" && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Movimientos de Combate</div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="sm"
              className={`h-9 flex-1 border-white/20 font-mono text-[11px] font-bold uppercase tracking-widest transition-colors ${microMoveMode?.unitId === unit.id && microMoveMode?.type === "pile-in" ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"}`}
              onClick={() => onMicroMove?.(unit.id, "pile-in")}
            >
              Apilar (3")
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={`h-9 flex-1 border-white/20 font-mono text-[11px] font-bold uppercase tracking-widest transition-colors ${microMoveMode?.unitId === unit.id && microMoveMode?.type === "consolidate" ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"}`}
              onClick={() => onMicroMove?.(unit.id, "consolidate")}
            >
              Reagrupar (3")
            </Button>
          </div>
          {microMoveMode?.unitId === unit.id && (
            <div className="text-[10px] text-primary/80 font-mono text-center">
              Arrastra las miniaturas para moverlas hasta 3".
            </div>
          )}
        </div>
      )}

      {/* WEAPONS DATASHEET SECTION */}
      {token.weapons && token.weapons.length > 0 && (
        <div className="mt-6 flex flex-col gap-4">
          {(() => {
            const ranged = token.weapons.filter(w => w.type === "ranged")
            const melee = token.weapons.filter(w => w.type === "melee")
            
            return (
              <>
                {ranged.length > 0 && (
                  <div className="flex flex-col overflow-hidden rounded-lg border border-white/10 shadow-inner">
                    <div className="bg-white/10 px-3 py-1.5 font-mono text-[11px] font-black uppercase tracking-widest text-foreground flex items-center gap-2">
                      <span className="text-primary text-sm">⌖</span> Ranged Weapons
                    </div>
                    <table className="w-full text-left font-sans text-xs">
                      <thead className="bg-black/40 text-muted-foreground font-mono text-[9px] uppercase tracking-wider">
                        <tr>
                          <th className="px-3 py-1.5 font-bold">Weapon</th>
                          <th className="px-2 py-1.5 font-bold text-center">Range</th>
                          <th className="px-2 py-1.5 font-bold text-center">A</th>
                          <th className="px-2 py-1.5 font-bold text-center">BS</th>
                          <th className="px-2 py-1.5 font-bold text-center">S</th>
                          <th className="px-2 py-1.5 font-bold text-center">AP</th>
                          <th className="px-2 py-1.5 font-bold text-center">D</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 bg-white/5">
                        {ranged.map((w, i) => (
                          <tr key={i} className="hover:bg-white/10 transition-colors">
                            <td className="px-3 py-2">
                              <div className="font-bold text-foreground drop-shadow-sm">{w.name}</div>
                              {w.abilities && w.abilities.length > 0 && (
                                <div className="font-mono text-[9px] text-primary mt-0.5 tracking-tight uppercase">
                                  [{w.abilities.join(", ")}]
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-2 text-center font-bold tabular-nums text-muted-foreground">{w.range}"</td>
                            <td className="px-2 py-2 text-center font-black tabular-nums">{w.attacks}</td>
                            <td className="px-2 py-2 text-center font-bold tabular-nums">{w.skill}+</td>
                            <td className="px-2 py-2 text-center font-bold tabular-nums">{w.strength}</td>
                            <td className="px-2 py-2 text-center font-bold tabular-nums">{w.ap === 0 ? "0" : w.ap}</td>
                            <td className="px-2 py-2 text-center font-bold tabular-nums">{w.damage}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                
                {melee.length > 0 && (
                  <div className="flex flex-col overflow-hidden rounded-lg border border-white/10 shadow-inner">
                    <div className="bg-white/10 px-3 py-1.5 font-mono text-[11px] font-black uppercase tracking-widest text-foreground flex items-center gap-2">
                      <span className="text-destructive text-sm">⚔</span> Melee Weapons
                    </div>
                    <table className="w-full text-left font-sans text-xs">
                      <thead className="bg-black/40 text-muted-foreground font-mono text-[9px] uppercase tracking-wider">
                        <tr>
                          <th className="px-3 py-1.5 font-bold">Weapon</th>
                          <th className="px-2 py-1.5 font-bold text-center">Range</th>
                          <th className="px-2 py-1.5 font-bold text-center">A</th>
                          <th className="px-2 py-1.5 font-bold text-center">WS</th>
                          <th className="px-2 py-1.5 font-bold text-center">S</th>
                          <th className="px-2 py-1.5 font-bold text-center">AP</th>
                          <th className="px-2 py-1.5 font-bold text-center">D</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 bg-white/5">
                        {melee.map((w, i) => (
                          <tr key={i} className="hover:bg-white/10 transition-colors">
                            <td className="px-3 py-2">
                              <div className="font-bold text-foreground drop-shadow-sm">{w.name}</div>
                              {w.abilities && w.abilities.length > 0 && (
                                <div className="font-mono text-[9px] text-destructive mt-0.5 tracking-tight uppercase">
                                  [{w.abilities.join(", ")}]
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-2 text-center font-bold tabular-nums text-muted-foreground">Melee</td>
                            <td className="px-2 py-2 text-center font-black tabular-nums">{w.attacks}</td>
                            <td className="px-2 py-2 text-center font-bold tabular-nums">{w.skill}+</td>
                            <td className="px-2 py-2 text-center font-bold tabular-nums">{w.strength}</td>
                            <td className="px-2 py-2 text-center font-bold tabular-nums">{w.ap === 0 ? "0" : w.ap}</td>
                            <td className="px-2 py-2 text-center font-bold tabular-nums">{w.damage}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )
          })()}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 shadow-inner">
        <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Estado</div>
        <div className="flex flex-wrap gap-2">
          <Badge on={token.moved} label="Movió" />
          <Badge on={!!unit.advanced} label="Avanzó" />
          <Badge on={!!unit.fellBack} label="Se retiró" />
          <Badge on={unit.hasCharged} label="Ataca primero" />
          <Badge on={unit.isBattleShocked} label="Acobardado" danger />
          <Badge on={token.currentWounds <= 0} label="Destruido" danger />
          <Badge on={token.currentWounds > 0 && token.currentWounds < token.stats.wounds} label="Herido" />
          <Badge on={!!token.embarkedIn} label="Embarcado" />
        </div>
      </div>

      {/* KEYWORDS */}
      {token.keywords && token.keywords.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <span className="text-foreground mr-1">KEYWORDS:</span>
          {token.keywords.map((k, i) => (
            <span key={k} className="flex items-center gap-1.5">
              <span>{k}</span>
              {i < token.keywords.length - 1 && <span className="text-white/20">,</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Badge({ label, on, danger }: { label: string; on: boolean; danger?: boolean }) {
  return (
    <span
      className={`rounded-md px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider shadow-sm transition-all ${
        on
          ? danger
            ? "bg-destructive/20 text-destructive border border-destructive/30 shadow-[0_0_10px_rgba(255,0,0,0.2)]"
            : "bg-primary/20 text-primary border border-primary/30 shadow-[0_0_10px_rgba(0,200,255,0.2)]"
          : "bg-black/30 text-muted-foreground/50 border border-white/5"
      }`}
    >
      {label}
    </span>
  )
}
