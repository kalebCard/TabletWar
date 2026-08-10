"use client"

import { useEffect, useMemo, useState } from "react"
import type { Phase, Terrain, Token, Weapon, Unit } from "@/lib/game/types"
import { FACTIONS } from "@/lib/game/constants"
import {
  eligibleTargets,
  saveResolution,
  skillLabel,
  woundTarget,
  type TargetInfo,
} from "@/lib/game/combat"
import {
  classify,
  countSuccesses,
  rerollFails,
  rerollOnes,
  rollDice,
  sortedDesc,
  type Die,
} from "@/lib/game/dice"
import { Button } from "@/components/ui/button"
import { EventBus } from "@/lib/game/EventBus"
import { DiceGrid, RerollRow, Step, Result, Chip, Tag, Empty } from "./combat/DiceRollStep"

export interface ResolveResult {
  attackerId?: string
  attackerName: string
  targetId: string
  targetName: string
  weaponName: string
  hits: number
  wounds: number
  unsaved: number
  totalDamage: number
  slain: boolean
}

interface Props {
  attacker: Token | null
  tokens: Token[]
  units: Unit[]
  terrain: Terrain[]
  phase: Phase
  targetId: string | null
  onSetTarget: (id: string | null) => void
  onResolve: (r: ResolveResult) => void
  onCharge?: (attackerId: string, targetId: string, distance: number, success: boolean) => void
  queue?: {attackerId: string, targetId: string, phase: string}[]
  onDequeue?: () => void
  onRemoveFromQueue?: (a: string, t: string) => void
}

type Stage = "setup" | "hit" | "wound" | "save" | "done" | "charge_roll"

export function CombatPanel(props: Props) {
  const { tokens, units, terrain, phase, onSetTarget, onResolve, onCharge, queue, onDequeue, onRemoveFromQueue } = props;
  
  const activeAttack = queue && queue.length > 0 && queue[0].phase === phase ? queue[0] : null;
  const attacker = activeAttack ? (tokens.find(t => t.id === activeAttack.attackerId) || null) : props.attacker;
  const targetId = activeAttack ? activeAttack.targetId : props.targetId;

  const [weaponIdx, setWeaponIdx] = useState<number | null>(null)
  const [stage, setStage] = useState<Stage>("setup")
  const [hitDice, setHitDice] = useState<Die[]>([])
  const [woundDice, setWoundDice] = useState<Die[]>([])
  const [saveDice, setSaveDice] = useState<Die[]>([])
  const [summary, setSummary] = useState<ResolveResult | null>(null)

  const [fnpDice, setFnpDice] = useState<Die[]>([])
  const [fnpStage, setFnpStage] = useState<boolean>(false)

  const weaponType = phase === "fight" ? "melee" : "ranged"

  const attackerUnit = attacker ? units.find(u => u.id === attacker.unitId) : null
  
  const weapons = useMemo(() => {
    if (!attacker) return []
    return attacker.weapons.filter(w => {
      if (w.type !== weaponType) return false
      // Cannot shoot if fell back
      if (attackerUnit?.fellBack) return false
      // Cannot shoot if advanced unless weapon has Asalto
      if (weaponType === "ranged" && attackerUnit?.advanced && !w.abilities?.includes("Asalto")) return false
      return true
    })
  }, [attacker, weaponType, attackerUnit])
  
  const weapon: Weapon | null = weaponIdx != null ? weapons[weaponIdx] ?? null : null

  const targets = useMemo<TargetInfo[]>(
    () => (attacker && weapon ? eligibleTargets(attacker, weapon, tokens, terrain) : []),
    [attacker, weapon, tokens, terrain],
  )
  const target = targets.find((t) => t.token.id === targetId) ?? null

  // Reset the whole sequence whenever the actor, weapon, target or phase changes.
  useEffect(() => {
    setStage("setup")
    setHitDice([])
    setWoundDice([])
    setSaveDice([])
    setSummary(null)
  }, [attacker?.id, weaponIdx, targetId, phase])

  // Reset weapon choice when attacker or phase changes.
  useEffect(() => {
    setWeaponIdx(null)
    onSetTarget(null)
  }, [attacker?.id, phase, onSetTarget])

  // ---- charge state ----
  const [chargeDice, setChargeDice] = useState<Die[]>([])

  // Reset charge dice on attacker or target change
  useEffect(() => {
    setChargeDice([])
  }, [attacker?.id, targetId])

  // Eligible charge targets (within 12")
  const chargeTargets = useMemo(() => {
    if (phase !== "charge" || !attacker) return []
    const tgs: { token: Token; distance: number }[] = []
    tokens.forEach(t => {
      if (t.faction !== attacker.faction && t.currentWounds > 0) {
        // approximate distance for now (center to center minus bases)
        const d = Math.hypot(t.x - attacker.x, t.y - attacker.y) - (attacker.baseMm / 25.4 / 2) - (t.baseMm / 25.4 / 2)
        if (d <= 12) {
          tgs.push({ token: t, distance: d })
        }
      }
    })
    return tgs.sort((a, b) => a.distance - b.distance)
  }, [attacker, tokens, phase])

  if (!attacker && (!queue || queue.length === 0)) {
    return (
      <Empty>
        En la fase actual, selecciona una miniatura y <b>arrastra hacia un enemigo</b> para encolar un ataque.
      </Empty>
    )
  }

  if (queue && queue.length > 0 && !activeAttack) {
    return (
      <Empty>
        Ataques encolados para otra fase.
      </Empty>
    )
  }
  
  if (!attacker) {
    return (
      <Empty>
        Mininatura atacante no encontrada.
      </Empty>
    )
  }
  
  if (attackerUnit?.fellBack) {
    return (
      <Empty>
        {attacker.name} se retiró este turno y no puede {phase === "charge" ? "cargar" : "atacar"}.
      </Empty>
    )
  }
  
  if (phase === "charge" && attackerUnit?.advanced) {
    return (
      <Empty>
        {attacker.name} avanzó este turno y no puede cargar.
      </Empty>
    )
  }

  if (phase !== "charge" && weapons.length === 0) {
    return (
      <Empty>
        {attacker.name} no tiene armas de {weaponType === "melee" ? "cuerpo a cuerpo" : "distancia"} elegibles para esta fase.
      </Empty>
    )
  }

  const fac = FACTIONS[attacker.faction]

  // ---- abilities ----
  const hasLethalHits = weapon?.abilities?.includes("Impactos Letales") ?? false
  const hasDevastatingWounds = weapon?.abilities?.includes("Heridas Devastadoras") ?? false
  const hasSustainedHits = weapon?.abilities?.some(a => a.startsWith("Impactos Sostenidos")) ?? false
  const sustainedValue = hasSustainedHits && weapon ? parseInt(weapon.abilities?.find(a => a.startsWith("Impactos Sostenidos"))?.split(" ")[2] || "1") : 1
  const hasTwinLinked = weapon?.abilities?.includes("Acoplada") ?? false
  
  const isPistol = weapon?.abilities?.includes("Pistola") ?? false
  const getEnemies = (t: Token) => tokens.filter(x => x.faction !== t.faction && x.currentWounds > 0 && x.id !== t.id)
  const isEngaged = (t: Token) => getEnemies(t).some(e => {
    const d = Math.hypot(e.x - t.x, e.y - t.y) - (e.baseMm / 25.4 / 2) - (t.baseMm / 25.4 / 2)
    return d <= 1.0
  })
  
  const inEng = isEngaged(attacker)
  const tgtEng = target ? isEngaged(target.token) : false
  const bgntPenalty = weaponType === "ranged" && !isPistol && (inEng || tgtEng)
  const actualSkill = Math.min(6, (weapon?.skill ?? 6) + (bgntPenalty ? 1 : 0))

  // ---- derived counts ----
  let hitsToRollWoundsFor = 0
  let autoWounds = 0
  
  hitDice.forEach(d => {
    const c = classify(d.value, actualSkill)
    if (c.crit6) {
      if (hasLethalHits) autoWounds++
      else hitsToRollWoundsFor++
      
      if (hasSustainedHits) hitsToRollWoundsFor += sustainedValue
    } else if (c.success) {
      hitsToRollWoundsFor++
    }
  })
  
  const hits = hitsToRollWoundsFor + autoWounds
  const woundTgt = weapon && target ? woundTarget(weapon.strength, target.token.stats.toughness) : 0
  
  let normalWounds = 0
  let devWounds = 0
  
  woundDice.forEach(d => {
    const c = classify(d.value, woundTgt)
    if (c.crit6) {
      if (hasDevastatingWounds) devWounds++
      else normalWounds++
    } else if (c.success) {
      normalWounds++
    }
  })
  
  const savesToRoll = normalWounds + autoWounds
  const woundCount = savesToRoll + devWounds
  
  const save = weapon && target
    ? saveResolution(target.token.stats.save, weapon.ap, target.cover, target.token.stats.invuln)
    : null
  const saved = save && !save.noSave ? countSuccesses(saveDice, save.target) : 0
  const unsavedNormal = savesToRoll - saved
  const unsaved = unsavedNormal + devWounds

  // FNP
  const fnpTgt = target?.token.stats.fnp ?? null
  const hasFnp = fnpTgt !== null
  
  const totalDamageBeforeFnp = unsaved * (weapon?.damage ?? 1)
  const ignoredDamage = countSuccesses(fnpDice, fnpTgt ?? 7)
  const finalDamage = Math.max(0, totalDamageBeforeFnp - ignoredDamage)



  const rollHits = () => {
    if (!weapon) return
    const dice = rollDice(weapon.attacks)
    setHitDice(dice)
    setStage("hit")
    EventBus.emit('roll-dice-visual', { dice, color: fac.color })
    if (attacker && target) {
      EventBus.emit('animate-shoot', { attackerId: attacker.id, targetId: target.token.id })
    }
  }
  const rollWounds = () => {
    const dice = rollDice(hitsToRollWoundsFor)
    setWoundDice(dice)
    setStage("wound")
    EventBus.emit('roll-dice-visual', { dice, color: fac.color })
  }
  const rollSaves = () => {
    if (!save) return
    const dice = save.noSave ? [] : rollDice(savesToRoll)
    setSaveDice(dice)
    setStage("save")
    if (dice.length > 0) {
      const targetFac = target ? FACTIONS[target.token.faction] : fac
      EventBus.emit('roll-dice-visual', { dice, color: targetFac.color })
    }
  }
  const rollFnp = () => {
    const dice = rollDice(totalDamageBeforeFnp)
    setFnpDice(dice)
    setFnpStage(true)
    const targetFac = target ? FACTIONS[target.token.faction] : fac
    EventBus.emit('roll-dice-visual', { dice, color: targetFac.color })
  }
  
  const apply = () => {
    if (!weapon || !target) return
    const totalDamage = hasFnp && fnpStage ? finalDamage : totalDamageBeforeFnp
    const slain = totalDamage >= target.token.currentWounds
    const r: ResolveResult = {
      attackerId: attacker.id,
      attackerName: attacker.name,
      targetId: target.token.id,
      targetName: target.token.name,
      weaponName: weapon.name,
      hits,
      wounds: woundCount,
      unsaved,
      totalDamage,
      slain,
    }
    setSummary(r)
    setStage("done")
    onResolve(r)
  }
  const handleDone = () => {
    if (summary) {
      onResolve(summary)
    }
    if (onDequeue && activeAttack) {
      onDequeue()
    }
    setStage("setup")
    setHitDice([])
    setWoundDice([])
    setSaveDice([])
    setFnpDice([])
    setFnpStage(false)
    setChargeDice([])
    setSummary(null)
  }

  const rollCharge = () => {
    const dice = rollDice(2)
    setChargeDice(dice)
    setStage("charge_roll")
    EventBus.emit('roll-dice-visual', { dice, color: fac.color })
  }
  const applyCharge = (success: boolean, distRoll: number) => {
    if (!attacker || !targetId || !onCharge) return
    onCharge(attacker.id, targetId, distRoll, success)
    setStage("done")
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6 bg-black/10">
      {queue && queue.length > 0 && phase !== "charge" && (
        <div className="flex flex-col gap-2 mb-2">
          <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-primary drop-shadow-[0_0_5px_currentColor]">Ataques Encolados ({queue.length})</span>
          <div className="flex flex-col gap-2">
            {queue.filter(q => q.phase === phase).map((q, i) => {
              const att = tokens.find(t => t.id === q.attackerId)
              const tgt = tokens.find(t => t.id === q.targetId)
              if (!att || !tgt) return null
              return (
                <div key={`${q.attackerId}-${q.targetId}-${i}`} className={`flex items-center justify-between p-3 rounded-xl border shadow-inner transition-colors ${i === 0 ? 'bg-primary/10 border-primary/50 shadow-[0_0_15px_rgba(0,150,255,0.1)]' : 'bg-white/5 border-white/10 opacity-70'}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-sans text-sm font-bold drop-shadow-md text-primary">{att.name}</span>
                    <span className="text-[10px]">⚔️</span>
                    <span className="font-sans text-sm font-bold drop-shadow-md text-destructive">{tgt.name}</span>
                  </div>
                  {onRemoveFromQueue && (
                    <button onClick={() => onRemoveFromQueue(q.attackerId, q.targetId)} className="text-destructive text-xs px-2 py-1 rounded bg-destructive/10 hover:bg-destructive/30 transition-colors border border-destructive/20">✕</button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* attacker header */}
      <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/10 shadow-inner">
        <span className="h-3 w-3 rounded-full shadow-[0_0_10px_currentColor]" style={{ backgroundColor: fac.color, color: fac.color }} />
        <span className="font-sans text-base font-bold text-foreground drop-shadow-sm">{attacker.name}</span>
        <span className="ml-auto font-mono text-[11px] font-bold uppercase tracking-widest text-primary drop-shadow-sm">
          {weaponType === "melee" ? "Cuerpo a cuerpo" : "Distancia"} · {phase === "fight" ? "Combate" : "Disparo"}
        </span>
      </div>

      {/* weapon picker (only for shooting/fight) */}
      {phase !== "charge" && (
        <div className="flex flex-col gap-2">
          {weapons.map((w, i) => (
            <button
              key={w.name}
              onClick={() => setWeaponIdx(i)}
              className={`rounded-xl border px-4 py-3 text-left transition-all duration-200 shadow-sm ${
                weaponIdx === i
                  ? "border-primary/50 bg-primary/10 shadow-[0_0_15px_rgba(0,150,255,0.1)]"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-sans text-sm font-bold text-foreground">{w.name}</span>
                <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  {w.type === "ranged" ? `${w.range}"` : "melee"}
                </span>
              </div>
              <div className="mt-2 flex gap-3 font-mono text-[11px] font-bold text-muted-foreground/80">
                <Chip label="A" value={`${w.attacks}`} />
                <Chip label={w.type === "ranged" ? "BS" : "WS"} value={skillLabel(w.skill)} />
                <Chip label="S" value={`${w.strength}`} />
                <Chip label="AP" value={`${w.ap}`} />
                <Chip label="D" value={`${w.damage}`} />
              </div>
              {w.abilities && w.abilities.length > 0 && (
                <div className="mt-1 flex gap-1 flex-wrap">
                  {w.abilities.map(a => (
                    <span key={a} className="rounded bg-primary/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary border border-primary/30">
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* target picker (shooting/fight) */}
      {phase !== "charge" && weapon && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground mt-2">Objetivo</span>
          {targets.length === 0 && (
            <span className="font-sans text-sm text-muted-foreground/70">No hay miniaturas enemigas al alcance.</span>
          )}
          {targets.map((t) => {
            const isTargeted = activeAttack ? activeAttack.targetId === t.token.id : targetId === t.token.id;
            return (
            <button
              key={t.token.id}
              disabled={!t.eligible && !isTargeted}
              onClick={() => !activeAttack && onSetTarget(t.token.id)}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-all duration-200 shadow-sm ${
                isTargeted
                  ? "border-destructive/50 bg-destructive/10 shadow-[0_0_15px_rgba(255,0,0,0.1)]"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              } ${!t.eligible && !isTargeted ? "cursor-not-allowed opacity-40 grayscale" : ""}`}
            >
              <span className={`font-sans text-sm font-bold ${isTargeted ? 'text-destructive drop-shadow-sm' : 'text-foreground'}`}>{t.token.name}</span>
              <span className="flex items-center gap-2 font-mono text-[11px] font-bold text-muted-foreground">
                <span>{t.distance.toFixed(1)}&quot;</span>
                {t.cover && <Tag>cobertura</Tag>}
                {t.losBlocked && <Tag danger>sin ldv</Tag>}
                {!t.inRange && <Tag danger>lejos</Tag>}
              </span>
            </button>
          )})}
        </div>
      )}

      {/* charge target picker */}
      {phase === "charge" && (
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Declarar Objetivo de Carga</span>
          {chargeTargets.length === 0 && (
            <span className="font-mono text-[11px] text-muted-foreground/70">No hay miniaturas enemigas a menos de 12".</span>
          )}
          {chargeTargets.map((t) => (
            <button
              key={t.token.id}
              onClick={() => onSetTarget(t.token.id)}
              className={`flex items-center justify-between rounded-md border px-2.5 py-1.5 transition-colors ${
                targetId === t.token.id
                  ? "border-foreground/40 bg-[oklch(0.6_0.2_25)] text-white"
                  : "border-border bg-secondary/20 hover:bg-secondary/50"
              }`}
            >
              <span className="font-mono text-[11px] font-semibold">{t.token.name}</span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] opacity-70">
                <span>{t.distance.toFixed(1)}&quot;</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* charge sequence */}
      {phase === "charge" && targetId && (
        <div className="mt-1 flex flex-col gap-3 border-t border-border pt-3">
          <Step
            n={1}
            title="Tirada de Carga"
            sub="Tira 2D6 para determinar la distancia de carga"
            active={stage === "setup" || stage === "charge_roll"}
            done={stage === "done"}
          >
            {stage === "setup" && (
              <Button size="sm" className="h-8 w-full bg-[oklch(0.6_0.2_25)] text-white hover:bg-[oklch(0.5_0.2_25)] font-mono text-[11px] uppercase" onClick={rollCharge}>
                Tirar 2D6
              </Button>
            )}
            {(stage === "charge_roll" || stage === "done") && chargeDice.length > 0 && (
              <>
                <div className="flex gap-2">
                  {chargeDice.map(d => (
                    <div key={d.id} className="flex h-8 w-8 items-center justify-center rounded bg-secondary font-mono text-sm font-bold border border-border">
                      {d.value}
                    </div>
                  ))}
                </div>
                {(() => {
                  const rollTotal = chargeDice[0].value + chargeDice[1].value
                  const cTarget = chargeTargets.find(t => t.token.id === targetId)
                  if (!cTarget) return null
                  const needed = Math.max(0, cTarget.distance - 1)
                  const success = rollTotal >= needed
                  return (
                    <div className="flex flex-col gap-2 mt-2">
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="uppercase tracking-wider text-muted-foreground">Resultado</span>
                        <span className="text-foreground font-bold">{rollTotal}"</span>
                      </div>
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="uppercase tracking-wider text-muted-foreground">Necesario (Objetivo - 1")</span>
                        <span className="text-foreground">{needed.toFixed(1)}"</span>
                      </div>
                      <div className={`rounded border px-2 py-1.5 text-center font-mono text-[11px] uppercase tracking-wider ${success ? 'bg-[oklch(0.5_0.15_150)]/20 text-[oklch(0.8_0.15_150)] border-[oklch(0.8_0.15_150)]' : 'bg-destructive/20 text-destructive border-destructive'}`}>
                        {success ? "Carga Exitosa" : "Carga Fallida"}
                      </div>
                      {stage === "charge_roll" && (
                        <Button
                          size="sm"
                          className="h-8 w-full font-mono text-[11px] uppercase mt-1"
                          onClick={() => applyCharge(success, rollTotal)}
                        >
                          Confirmar
                        </Button>
                      )}
                    </div>
                  )
                })()}
              </>
            )}
          </Step>
        </div>
      )}

      {/* attack sequence */}
      {phase !== "charge" && weapon && target && (
        <div className="mt-1 flex flex-col gap-3 border-t border-border pt-3">
          {/* HIT */}
          <Step
            n={1}
            title="Tirada para Impactar"
            sub={`Impacta a ${skillLabel(actualSkill)}${bgntPenalty ? " (-1 BGNT)" : ""}`}
            active={stage === "setup" || stage === "hit"}
            done={["wound", "save", "done"].includes(stage)}
          >
            {stage === "setup" && (
              <Button size="sm" className="h-8 w-full font-mono text-[11px] uppercase" onClick={rollHits} disabled={!target?.eligible}>
                {target?.eligible ? `Tirar ${weapon.attacks} para Impactar` : "Objetivo inválido"}
              </Button>
            )}
            {["hit", "wound", "save", "done"].includes(stage) && hitDice.length > 0 && (
              <>
                <DiceGrid dice={hitDice} target={actualSkill} />
                <Result label="Impactos" value={hits} of={weapon.attacks} />
                {stage === "hit" && (
                  <>
                    <RerollRow
                      onOnes={() => setHitDice((d) => rerollOnes(d))}
                      onFails={() => setHitDice((d) => rerollFails(d, actualSkill))}
                    />
                    <Button
                      size="sm"
                      disabled={hitsToRollWoundsFor === 0 && autoWounds === 0}
                      className="h-8 w-full font-mono text-[11px] uppercase"
                      onClick={rollWounds}
                    >
                      {hitsToRollWoundsFor === 0 && autoWounds === 0 
                        ? "Sin impactos" 
                        : hitsToRollWoundsFor > 0 ? `Tirar ${hitsToRollWoundsFor} para Herir \u2192` : `Heridas automáticas \u2192`}
                    </Button>
                  </>
                )}
              </>
            )}
          </Step>

          {/* WOUND */}
          {["wound", "save", "done"].includes(stage) && (
            <Step
              n={2}
              title="Tirada para Herir"
              sub={`F${weapon.strength} vs R${target.token.stats.toughness} \u2192 ${woundTgt}+`}
              active={stage === "wound"}
              done={["save", "done"].includes(stage)}
            >
              <DiceGrid dice={woundDice} target={woundTgt} />
              <Result label="Heridas" value={woundCount} of={hits} />
              {autoWounds > 0 && (
                <div className="mt-1 text-right font-mono text-[10px] text-primary drop-shadow-sm uppercase">
                  (+{autoWounds} Automáticas por Impactos Letales)
                </div>
              )}
              {devWounds > 0 && (
                <div className="mt-1 text-right font-mono text-[10px] text-destructive drop-shadow-sm uppercase">
                  (¡{devWounds} Heridas Devastadoras!)
                </div>
              )}
              {hasTwinLinked && stage === "wound" && (
                <div className="mt-1 text-right font-mono text-[10px] text-primary drop-shadow-sm uppercase">
                  Arma Acoplada: Puedes repetir la tirada
                </div>
              )}
              {stage === "wound" && (
                <>
                  <RerollRow
                    onOnes={() => setWoundDice((d) => rerollOnes(d))}
                    onFails={() => setWoundDice((d) => rerollFails(d, woundTgt))}
                  />
                  <Button
                    size="sm"
                    disabled={savesToRoll === 0 && devWounds === 0}
                    className="h-8 w-full font-mono text-[11px] uppercase"
                    onClick={() => {
                      if (savesToRoll === 0) {
                        if (hasFnp) rollFnp()
                        else apply()
                      } else {
                        rollSaves()
                      }
                    }}
                  >
                    {savesToRoll === 0 && devWounds === 0 ? "Sin heridas" : savesToRoll > 0 ? "Tirar Salvaciones \u2192" : (hasFnp ? "Tirar No hay dolor \u2192" : "Aplicar Daño \u2192")}
                  </Button>
                </>
              )}
            </Step>
          )}

          {/* SAVE */}
          {["save", "done"].includes(stage) && save && (
            <Step
              n={3}
              title="Tirada de Salvación"
              sub={
                save.noSave
                  ? "No es posible salvar"
                  : `${save.target}+${save.usedInvuln ? " (invul)" : ""}${save.usedCover ? " +cobertura" : ""}`
              }
              active={stage === "save"}
              done={stage === "done"}
            >
              {save.noSave ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 font-mono text-[11px] text-destructive">
                  FP{weapon.ap} anula la salvación &mdash; todas las {savesToRoll} heridas normales fallan.
                </div>
              ) : (
                <>
                  <DiceGrid dice={saveDice} target={save.target} />
                  <Result label="Salvadas" value={saved} of={savesToRoll} />
                </>
              )}
              <div className="mt-1 flex items-center justify-between rounded-md bg-destructive/15 px-2.5 py-1.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-destructive">No Salvadas</span>
                <span className="font-mono text-sm font-bold tabular-nums text-destructive">
                  {unsaved} &times; D{weapon.damage} = {unsaved * weapon.damage}
                </span>
              </div>
              {stage === "save" && (
                <>
                  {!save.noSave && (
                    <RerollRow
                      onOnes={() => setSaveDice((d) => rerollOnes(d))}
                      onFails={() => setSaveDice((d) => rerollFails(d, save.target))}
                    />
                  )}
                  <Button
                    size="sm"
                    className="h-8 w-full font-mono text-[11px] uppercase"
                    onClick={hasFnp ? rollFnp : apply}
                  >
                    {hasFnp ? `Tirar No hay dolor (${totalDamageBeforeFnp} D) \u2192` : `Aplicar ${totalDamageBeforeFnp} de Daño`}
                  </Button>
                </>
              )}
            </Step>
          )}

          {/* FNP */}
          {(fnpStage || stage === "done") && hasFnp && (
            <Step
              n={4}
              title="No hay dolor (FNP)"
              sub={`FNP ${fnpTgt}+`}
              active={fnpStage && stage !== "done"}
              done={stage === "done"}
            >
              <DiceGrid dice={fnpDice} target={fnpTgt ?? 7} />
              <Result label="Ignoradas" value={ignoredDamage} of={totalDamageBeforeFnp} />
              <div className="mt-1 flex items-center justify-between rounded-md bg-destructive/15 px-2.5 py-1.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-destructive">Daño Final</span>
                <span className="font-mono text-sm font-bold tabular-nums text-destructive">
                  {finalDamage}
                </span>
              </div>
              {fnpStage && stage !== "done" && (
                <>
                  <Button
                    size="sm"
                    className="h-8 w-full font-mono text-[11px] uppercase mt-2"
                    onClick={apply}
                  >
                    Aplicar {finalDamage} de Daño
                  </Button>
                </>
              )}
            </Step>
          )}

          {/* DONE */}
          {stage === "done" && summary && (
            <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 shadow-inner mt-2">
              <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Resuelto</span>
              <p className="font-sans text-sm leading-relaxed text-foreground">
                <span className="text-primary font-bold">{summary.hits}</span> impactos &rarr; <span className="text-primary font-bold">{summary.wounds}</span> heridas &rarr; <span className="text-destructive font-bold">{summary.unsaved}</span> no salvadas para un total de{" "}
                <b className="text-destructive drop-shadow-sm text-base">{summary.totalDamage}</b> puntos de daño.
                {summary.slain && <span className="text-destructive font-bold block mt-1 uppercase tracking-wider text-xs"> {summary.targetName} destruido.</span>}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-10 w-full border-white/20 bg-black/20 font-mono text-[12px] font-bold uppercase tracking-widest transition-colors hover:bg-white/10 hover:text-foreground"
                onClick={handleDone}
              >
                Terminar Secuencia
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
