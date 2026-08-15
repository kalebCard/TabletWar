"use client"

import { useEffect, useMemo, useState } from "react"
import type { Phase, Terrain, Token, Weapon, Unit } from "@/lib/game/types"
import { FACTIONS } from "@/lib/game/constants"
import {
  eligibleTargets,
  saveResolution,
  skillLabel,
  woundTarget,
  resolveHits,
  resolveWounds,
  resolveDamage,
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
import { getEligibleWeapons, getChargeTargets, canAttackerAct, WeaponRules } from "@/lib/game/rules/combatRules"
import { Button } from "@/components/ui/button"
import { useUIStore } from "@/lib/store/uiStore"
import { useCombatPhase } from "./combat/hooks/useCombatPhase"
import { useCombatCalculations } from "./combat/hooks/useCombatCalculations"
import { DiceGrid, RerollRow, Step, Result, Chip, Tag, Empty } from "./combat/DiceRollStep"
import { WeaponSelector } from "./combat/WeaponSelector"
import { TargetSelector } from "./combat/TargetSelector"
import { HitPhase } from "./combat/phases/hit-phase"
import { WoundPhase } from "./combat/phases/wound-phase"
import { SavePhase } from "./combat/phases/save-phase"
import { FnpPhase } from "./combat/phases/fnp-phase"
import { ChargePhase } from "./combat/phases/charge-phase"

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
  
  const {
    stage, setStage,
    hitDice, setHitDice,
    woundDice, setWoundDice,
    saveDice, setSaveDice,
    summary, setSummary,
    fnpDice, setFnpDice,
    fnpStage, setFnpStage,
    chargeDice, setChargeDice
  } = useCombatPhase(attacker?.id, weaponIdx, targetId, phase, onSetTarget)

  const triggerVisualEvent = useUIStore(s => s.triggerVisualEvent)

  const weaponType = phase === "fight" ? "melee" : "ranged"

  const attackerUnit = attacker ? units.find(u => u.id === attacker.unitId) : null
  
  const weapons = useMemo(() => {
    return getEligibleWeapons(attacker!, attackerUnit, weaponType)
  }, [attacker, weaponType, attackerUnit])
  
  const weapon: Weapon | null = weaponIdx != null ? weapons[weaponIdx] ?? null : null

  const targets = useMemo<TargetInfo[]>(
    () => (attacker && weapon ? eligibleTargets(attacker, weapon, tokens, terrain) : []),
    [attacker, weapon, tokens, terrain],
  )
  const target = targets.find((t) => t.token.id === targetId) ?? null

  // Reset weapon choice when attacker or phase changes.
  useEffect(() => {
    setWeaponIdx(null)
    onSetTarget(null)
  }, [attacker?.id, phase, onSetTarget])

  // Eligible charge targets
  const chargeTargets = useMemo(() => {
    if (phase !== "charge" || !attacker) return []
    return getChargeTargets(attacker, tokens)
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
  
  const actionCheck = canAttackerAct(attackerUnit, phase)
  if (!actionCheck.canAct) {
    return (
      <Empty>
        {attacker.name} {actionCheck.reason}
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

  const {
    hasTwinLinked,
    bgntPenalty,
    actualSkill,
    hitsToRollWoundsFor,
    autoWounds,
    hits,
    woundTgt,
    normalWounds,
    devWounds,
    savesToRoll,
    woundCount,
    save,
    saved,
    unsaved,
    fnpTgt,
    hasFnp,
    finalDamage,
    ignoredDamage,
    totalDamageBeforeFnp
  } = useCombatCalculations({
    weapon,
    attacker,
    target,
    tokens,
    weaponType,
    hitDice,
    woundDice,
    saveDice,
    fnpDice
  })



  const rollHits = () => {
    if (!weapon) return
    const dice = rollDice(weapon.attacks)
    setHitDice(dice)
    setStage("hit")
    triggerVisualEvent('roll-dice-visual', { dice, color: fac.color })
    if (attacker && target) {
      triggerVisualEvent('animate-shoot', { attackerId: attacker.id, targetId: target.token.id })
    }
  }
  const rollWounds = () => {
    const dice = rollDice(hitsToRollWoundsFor)
    setWoundDice(dice)
    setStage("wound")
    triggerVisualEvent('roll-dice-visual', { dice, color: fac.color })
  }
  const rollSaves = () => {
    if (!save) return
    const dice = save.noSave ? [] : rollDice(savesToRoll)
    setSaveDice(dice)
    setStage("save")
    if (dice.length > 0) {
      const targetFac = target ? FACTIONS[target.token.faction] : fac
      triggerVisualEvent('roll-dice-visual', { dice, color: targetFac.color })
    }
  }
  const rollFnp = () => {
    const dice = rollDice(totalDamageBeforeFnp)
    setFnpDice(dice)
    setFnpStage(true)
    const targetFac = target ? FACTIONS[target.token.faction] : fac
    triggerVisualEvent('roll-dice-visual', { dice, color: targetFac.color })
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
    triggerVisualEvent('roll-dice-visual', { dice, color: fac.color })
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
        <WeaponSelector weapons={weapons} weaponIdx={weaponIdx} setWeaponIdx={setWeaponIdx} />
      )}

      {/* target picker (shooting/fight) */}
      {phase !== "charge" && weapon && (
        <TargetSelector 
          targets={targets} 
          targetId={targetId} 
          activeAttackId={activeAttack?.targetId ?? null} 
          onSetTarget={onSetTarget} 
        />
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
      <ChargePhase
        phase={phase}
        targetId={targetId}
        stage={stage}
        chargeTargets={chargeTargets}
        chargeDice={chargeDice}
        rollCharge={rollCharge}
        applyCharge={applyCharge}
      />

      {/* attack sequence */}
      {phase !== "charge" && weapon && target && (
        <div className="mt-1 flex flex-col gap-3 border-t border-border pt-3">
          {/* HIT */}
          <HitPhase
            weapon={weapon}
            target={target}
            actualSkill={actualSkill}
            bgntPenalty={bgntPenalty}
            stage={stage}
            hitDice={hitDice}
            hits={hits}
            hitsToRollWoundsFor={hitsToRollWoundsFor}
            autoWounds={autoWounds}
            rollHits={rollHits}
            rollWounds={rollWounds}
            setHitDice={setHitDice}
          />

          {/* WOUND */}
          <WoundPhase
            weapon={weapon}
            target={target}
            woundTgt={woundTgt}
            stage={stage}
            woundDice={woundDice}
            hits={hits}
            woundCount={woundCount}
            autoWounds={autoWounds}
            devWounds={devWounds}
            hasTwinLinked={hasTwinLinked}
            savesToRoll={savesToRoll}
            hasFnp={hasFnp}
            setWoundDice={setWoundDice}
            rollSaves={rollSaves}
            rollFnp={rollFnp}
            apply={apply}
          />

          {/* SAVE */}
          {save && (
            <SavePhase
              weapon={weapon}
              save={save}
              stage={stage}
              saveDice={saveDice}
              savesToRoll={savesToRoll}
              saved={saved}
              unsaved={unsaved}
              hasFnp={hasFnp}
              totalDamageBeforeFnp={totalDamageBeforeFnp}
              setSaveDice={setSaveDice}
              rollFnp={rollFnp}
              apply={apply}
            />
          )}

          {/* FNP */}
          <FnpPhase
            fnpStage={fnpStage}
            stage={stage}
            hasFnp={hasFnp}
            fnpTgt={fnpTgt}
            fnpDice={fnpDice}
            ignoredDamage={ignoredDamage}
            totalDamageBeforeFnp={totalDamageBeforeFnp}
            finalDamage={finalDamage}
            apply={apply}
          />

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
