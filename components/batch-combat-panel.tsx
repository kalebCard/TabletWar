"use client"

import { useEffect, useMemo, useState } from "react"
import type { Phase, Terrain, Token, Weapon, Unit, QueuedAttack } from "@/lib/game/types"
import { FACTIONS } from "@/lib/game/constants"
import { saveResolution, skillLabel, woundTarget } from "@/lib/game/combat"
import { countSuccesses, rerollFails, rerollOnes, rollDice, type Die } from "@/lib/game/dice"
import { Button } from "@/components/ui/button"
import { EventBus } from "@/lib/game/EventBus"
import { getDistanceBetweenTokens } from "@/lib/game/utils"
import type { ResolveResult } from "./combat-panel"

interface Props {
  tokens: Token[]
  units: Unit[]
  terrain: Terrain[]
  phase: Phase
  queue: QueuedAttack[]
  onUpdateWeapon: (attackerId: string, targetId: string, weaponIdx: number) => void
  onRemoveFromQueue: (attackerId: string, targetId: string) => void
  onResolveBatch: (results: ResolveResult[]) => void
  onCancel: () => void
}

type BatchStage = "setup" | "hit" | "wound" | "save" | "done"

interface AttackState {
  attackerId: string
  targetId: string
  weaponIdx: number
  hitDice: Die[]
  woundDice: Die[]
  saveDice: Die[]
}

export function BatchCombatPanel({ tokens, units, terrain, phase, queue, onUpdateWeapon, onRemoveFromQueue, onResolveBatch, onCancel }: Props) {
  const [stage, setStage] = useState<BatchStage>("setup")
  const [states, setStates] = useState<AttackState[]>([])

  const weaponType = phase === "fight" ? "melee" : "ranged"
  const activeQueue = queue.filter(q => q.phase === phase)

  // Initialize/sync states with queue
  useEffect(() => {
    setStates(activeQueue.map(q => ({
      attackerId: q.attackerId,
      targetId: q.targetId,
      weaponIdx: q.weaponIdx || 0,
      hitDice: [],
      woundDice: [],
      saveDice: []
    })))
  }, [activeQueue.length]) // only re-sync on length change so we don't lose dice state when changing weapons

  // Computed data for each queued attack
  const attackData = useMemo(() => {
    return activeQueue.map((q, i) => {
      const state = states[i] || { hitDice: [], woundDice: [], saveDice: [] }
      const attacker = tokens.find(t => t.id === q.attackerId)
      const target = tokens.find(t => t.id === q.targetId)
      const attackerUnit = attacker ? units.find(u => u.id === attacker.unitId) : null
      
      const weapons = attacker ? attacker.weapons.filter(w => {
        if (w.type !== weaponType) return false
        if (attackerUnit?.fellBack) return false
        if (weaponType === "ranged" && attackerUnit?.advanced && !w.abilities?.includes("Asalto")) return false
        return true
      }) : []
      
      const weapon = weapons[q.weaponIdx || 0] || null

      let actualSkill = weapon ? weapon.skill : 6

      const woundTgt = weapon && target ? woundTarget(weapon.strength, target.stats.toughness) : 6
      const saveRes = weapon && target ? saveResolution(target.stats.save, weapon.ap, false, target.stats.invuln) : { target: 6, noSave: false }

      // Distance between attacker and target tokens
      const distance = (attacker && target) ? getDistanceBetweenTokens(attacker, target) : null
      // For melee: must be within 1" engagement range. For ranged: within weapon.range
      const inRange = weapon && distance !== null
        ? (weaponType === "melee" ? distance <= 1.0 : (weapon.range === 0 || distance <= weapon.range))
        : null

      // Has this unit charged this turn? (gives +1 attack for charge)
      const hasCharged = attackerUnit?.hasCharged ?? false

      return {
        q,
        state,
        attacker,
        target,
        attackerUnit,
        weapons,
        weapon,
        actualSkill,
        woundTgt,
        saveRes,
        distance,
        inRange,
        hasCharged
      }
    })
  }, [activeQueue, states, tokens, units, weaponType])

  const validAttacks = attackData.filter(d => d.attacker && d.target && d.weapon)

  const rollAllHits = () => {
    const newStates = [...states]
    let allDice: Die[] = []
    
    validAttacks.forEach((data, i) => {
      if (!data.weapon) return
      const dice = rollDice(data.weapon.attacks)
      newStates[i].hitDice = dice
      allDice = [...allDice, ...dice]
    })
    
    setStates(newStates)
    setStage("hit")
    if (allDice.length > 0) {
      EventBus.emit('roll-dice-visual', { dice: allDice, color: '#ff0000' })
    }
  }

  const rollAllWounds = () => {
    const newStates = [...states]
    let allDice: Die[] = []
    
    validAttacks.forEach((data, i) => {
      if (!data.weapon) return
      const hits = countSuccesses(data.state.hitDice, data.actualSkill)
      if (hits > 0) {
        const dice = rollDice(hits)
        newStates[i].woundDice = dice
        allDice = [...allDice, ...dice]
      }
    })
    
    setStates(newStates)
    setStage("wound")
    if (allDice.length > 0) {
      EventBus.emit('roll-dice-visual', { dice: allDice, color: '#ff8800' })
    }
  }

  const rollAllSavesAndResolve = () => {
    const newStates = [...states]
    let allDice: Die[] = []
    
    validAttacks.forEach((data, i) => {
      if (!data.weapon || !data.target) return
      const wounds = countSuccesses(data.state.woundDice, data.woundTgt)
      if (wounds > 0 && !data.saveRes.noSave) {
        const dice = rollDice(wounds)
        newStates[i].saveDice = dice
        allDice = [...allDice, ...dice]
      }
    })
    
    setStates(newStates)
    setStage("done")
    if (allDice.length > 0) {
      EventBus.emit('roll-dice-visual', { dice: allDice, color: '#0088ff' })
    }

    const results: ResolveResult[] = validAttacks.map((data, i) => {
      const hits = countSuccesses(data.state.hitDice, data.actualSkill)
      const wounds = countSuccesses(data.state.woundDice, data.woundTgt)
      const saveDice = newStates[i].saveDice
      const unsaved = data.saveRes.noSave ? wounds : wounds - countSuccesses(saveDice, data.saveRes.target)
      const totalDamage = Math.max(0, unsaved) * (data.weapon?.damage || 1)
      
      return {
        attackerName: data.attacker!.name,
        targetId: data.target!.id,
        targetName: data.target!.name,
        weaponName: data.weapon!.name,
        hits,
        wounds,
        unsaved: Math.max(0, unsaved),
        totalDamage,
        slain: false
      }
    })

    setTimeout(() => {
      onResolveBatch(results)
    }, 4500)
  }

  if (activeQueue.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl max-w-sm flex flex-col items-center gap-3">
          <span className="text-3xl">🎯</span>
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-primary">Declarar Ataques</span>
          <p className="font-sans text-xs leading-relaxed text-muted-foreground">
            En esta fase de <b className="text-foreground">{phase === "shooting" ? "Disparo" : "Combate"}</b>, haz clic sobre una miniatura y <b>arrastra la línea roja</b> hasta una miniatura enemiga para declarar un ataque.
          </p>
          <span className="font-mono text-[10px] text-muted-foreground/60 uppercase tracking-wider">Puedes declarar múltiples ataques en el mapa antes de tirar los dados.</span>
        </div>
      </div>
    )
  }

  const isMelee = phase === "fight"

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6 bg-black/10">
      <div className="flex items-center justify-between mb-2">
        <span className={`font-mono text-[13px] font-bold uppercase tracking-widest drop-shadow-[0_0_5px_currentColor] ${
          isMelee ? 'text-red-400' : 'text-primary'
        }`}>
          {isMelee ? '⚔️ Combate CaC' : '🎯 Ataques Simultáneos'} ({activeQueue.length})
        </span>
        <Button variant="ghost" size="sm" onClick={onCancel} className="text-destructive">Cancelar</Button>
      </div>

      <div className="flex flex-col gap-3">
        {attackData.map((data, i) => {
          if (!data.attacker || !data.target) return null
          // For melee: engaged = within 1", for ranged: in weapon range
          const isEngaged = isMelee ? (data.distance !== null && data.distance <= 1.0) : data.inRange
          const distColor = isEngaged === false ? 'text-red-400' : 'text-emerald-400'
          // Card border color: red for melee, blue for ranged
          const cardBorder = isMelee ? 'border-red-500/20 bg-red-950/10' : 'border-white/10 bg-white/5'
          return (
            <div key={`${data.q.attackerId}-${data.q.targetId}-${i}`} className={`flex flex-col p-3 rounded-xl border shadow-inner gap-2 ${cardBorder}`}>
              {/* Header: attacker → target */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-sans text-sm font-bold ${isMelee ? 'text-red-300' : 'text-primary'}`}>{data.attacker.name}</span>
                  <span className="text-[10px]">{isMelee ? '⚔️' : '🎯'}</span>
                  <span className="font-sans text-sm font-bold text-destructive">{data.target.name}</span>
                </div>
                {stage === "setup" && (
                  <button onClick={() => onRemoveFromQueue(data.q.attackerId, data.q.targetId)} className="text-destructive text-xs hover:text-red-400">✕</button>
                )}
              </div>

              {/* Charge bonus badge for melee */}
              {isMelee && data.hasCharged && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full px-2 py-0.5 font-bold">⚡ Cargó este turno — +1 Ataque</span>
                </div>
              )}

              {/* Distance / Engagement badge */}
              {data.distance !== null && (
                <div className="flex items-center gap-2 text-[11px] font-mono">
                  <span className="text-muted-foreground">📏 Dist:</span>
                  <span className={`font-bold ${distColor}`}>{data.distance.toFixed(1)}"</span>
                  {isMelee ? (
                    <>
                      <span className="text-muted-foreground">/ Compromiso: 1"</span>
                      {isEngaged
                        ? <span className="ml-auto text-emerald-400 font-bold text-[10px] uppercase tracking-wider">⚔ Trabado</span>
                        : <span className="ml-auto text-red-400 font-bold text-[10px] uppercase tracking-wider">⚠ Fuera de alcance CaC</span>}
                    </>
                  ) : (
                    <>
                      {data.weapon && data.weapon.range > 0 && (
                        <span className="text-muted-foreground">/ Rango: {data.weapon.range}"</span>
                      )}
                      {data.inRange === false && (
                        <span className="ml-auto text-red-400 font-bold text-[10px] uppercase tracking-wider">⚠ Fuera de rango</span>
                      )}
                      {data.inRange === true && data.weapon && data.weapon.range > 0 && (
                        <span className="ml-auto text-emerald-400 font-bold text-[10px] uppercase tracking-wider">✓ En rango</span>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Weapon selector / label */}
              {stage === "setup" ? (
                <select 
                  className="w-full bg-black/30 border border-white/10 rounded-md p-1.5 text-xs font-mono"
                  value={data.q.weaponIdx || 0}
                  onChange={(e) => onUpdateWeapon(data.q.attackerId, data.q.targetId, parseInt(e.target.value))}
                >
                  {data.weapons.map((w, wi) => (
                    <option key={w.name} value={wi}>
                      {w.name} — {data.hasCharged ? w.attacks + 1 : w.attacks} ataques, HC{w.skill}+
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-xs font-mono text-muted-foreground">
                  {data.weapon?.name}
                </div>
              )}

              {/* Weapon stats row */}
              {stage === "setup" && data.weapon && (
                <div className="grid grid-cols-5 gap-1 mt-1">
                  {([
                    {
                      label: isMelee ? 'A' : 'A',
                      value: isMelee
                        ? (data.hasCharged ? data.weapon.attacks + 1 : data.weapon.attacks)
                        : data.weapon.attacks,
                      title: isMelee ? 'Ataques cuerpo a cuerpo' : 'Ataques (disparos)',
                      color: 'text-cyan-400'
                    },
                    {
                      label: isMelee ? 'HC' : 'HP',
                      value: `${data.weapon.skill}+`,
                      title: isMelee ? 'Habilidad de Combate' : 'Habilidad de Proyectiles',
                      color: 'text-yellow-300'
                    },
                    { label: 'F', value: data.weapon.strength, title: 'Fuerza', color: 'text-orange-400' },
                    { label: 'FP', value: data.weapon.ap === 0 ? '-' : data.weapon.ap, title: 'Penetración de Armadura', color: 'text-red-400' },
                    { label: 'D', value: data.weapon.damage, title: 'Daño por herida', color: 'text-violet-400' },
                  ] as const).map(stat => (
                    <div key={stat.label} title={stat.title} className="flex flex-col items-center rounded-lg bg-black/30 border border-white/10 py-1">
                      <span className={`font-mono text-xs font-bold ${stat.color}`}>{stat.value}</span>
                      <span className="font-mono text-[9px] text-muted-foreground uppercase">{stat.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Target defensive stats (for melee context) */}
              {isMelee && stage === "setup" && data.target && (
                <div className="flex items-center gap-2 mt-0.5 text-[10px] font-mono">
                  <span className="text-muted-foreground">Objetivo:</span>
                  <span className="text-white/70">R{data.target.stats.toughness}</span>
                  <span className="text-white/40">·</span>
                  <span className="text-white/70">Sv{data.target.stats.save}+</span>
                  {data.target.stats.invuln && (
                    <><span className="text-white/40">·</span>
                    <span className="text-amber-300">{data.target.stats.invuln}++</span></>
                  )}
                  <span className="text-white/40">·</span>
                  <span className="text-red-300">{data.target.currentWounds}/{data.target.stats.wounds}H</span>
                </div>
              )}

              {/* Abilities chips */}
              {stage === "setup" && data.weapon?.abilities && data.weapon.abilities.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {data.weapon.abilities.map(ab => (
                    <span key={ab} className="text-[9px] font-mono bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded-full px-2 py-0.5">{ab}</span>
                  ))}
                </div>
              )}
              
              {/* Result chips */}
              {stage !== "setup" && (
                <div className="flex gap-2 text-[10px] font-mono mt-1">
                  {stage === "hit" || stage === "wound" || stage === "done" ? (
                    <span className="bg-primary/20 text-primary px-1 rounded">{countSuccesses(data.state.hitDice, data.actualSkill)} Impactos</span>
                  ) : null}
                  {stage === "wound" || stage === "done" ? (
                    <span className="bg-orange-500/20 text-orange-400 px-1 rounded">{countSuccesses(data.state.woundDice, data.woundTgt)} Heridas</span>
                  ) : null}
                  {stage === "done" ? (
                    <span className="bg-destructive/20 text-destructive px-1 rounded">
                      {data.saveRes.noSave ? countSuccesses(data.state.woundDice, data.woundTgt) : countSuccesses(data.state.woundDice, data.woundTgt) - countSuccesses(data.state.saveDice, data.saveRes.target)} Daño
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
        <Button 
          disabled={stage !== "setup"} 
          onClick={rollAllHits}
          className={`w-full font-mono text-[11px] uppercase shadow-sm transition-all ${
            stage === "setup"
              ? isMelee
                ? 'bg-red-700 hover:bg-red-600 text-white shadow-[0_0_15px_rgba(200,0,0,0.4)]'
                : 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_15px_rgba(0,150,255,0.3)]'
              : 'bg-white/5 border border-white/10 opacity-50'
          }`}
        >
          1. {isMelee ? '⚔️ Tirar para Golpear' : '🎯 Tirar Todos para Impactar'}
        </Button>
        
        <Button 
          disabled={stage !== "hit"} 
          onClick={rollAllWounds}
          className={`w-full font-mono text-[11px] uppercase shadow-sm transition-all ${stage === "hit" ? 'bg-orange-600 hover:bg-orange-500 text-white shadow-[0_0_15px_rgba(255,136,0,0.3)]' : 'bg-white/5 border border-white/10 opacity-50'}`}
        >
          2. {isMelee ? '💪 Tirar para Herir' : 'Tirar Todos para Herir'}
        </Button>
        
        <Button 
          disabled={stage !== "wound"} 
          onClick={rollAllSavesAndResolve}
          className={`w-full font-mono text-[11px] uppercase shadow-sm transition-all ${stage === "wound" ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(0,136,255,0.3)]' : 'bg-white/5 border border-white/10 opacity-50'}`}
        >
          3. {isMelee ? '🛡️ Tirar Salvaciones y Aplicar Daño' : 'Tirar Salvaciones y Aplicar Daño'}
        </Button>
      </div>
    </div>
  )
}
