import { useState, useEffect, useMemo, useRef } from 'react';
import type { FactionId, GameState, LogEntry, Phase, Token, Unit, RosterUnit, QueuedAttack, Terrain } from "./types";
import { PHASES } from "./types";
import { FACTIONS, DATASHEETS, createUnitFromDatasheet, makeObjectives, makeInitialTerrain } from "./constants";
import { rollD6, rollMultipleD6, getDistanceBetweenTokens } from './utils';
import { EventBus } from "./EventBus";

const newLog = (e: Omit<LogEntry, "id">): LogEntry => ({ ...e, id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` });

export function useGameEngine() {
  const [tokens, setTokens] = useState<Token[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [rosterUnits, setRosterUnits] = useState<RosterUnit[]>([])
  
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [combatTargetId, setCombatTargetId] = useState<string | null>(null)
  const [combatQueue, setCombatQueue] = useState<QueuedAttack[]>([])
  const [deployingUnitId, setDeployingUnitId] = useState<string | null>(null)
  const [microMoveMode, setMicroMoveMode] = useState<{ unitId: string, type: "pile-in" | "consolidate" } | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  
  const [game, setGame] = useState<GameState>({
    terrainLayout: "custom",
    round: 1,
    activePlayer: "imperium",
    phase: "roster",
    vp: { imperium: 0, chaos: 0 },
    cp: { imperium: 1, chaos: 1 },
    pointsLimit: 500
  })

  const [terrainState, setTerrainState] = useState<Terrain[]>(() => makeInitialTerrain(game.terrainLayout))

  // Update terrain if layout changes
  useEffect(() => {
    setTerrainState(makeInitialTerrain(game.terrainLayout))
  }, [game.terrainLayout])

  type Snapshot = {
    tokens: Token[],
    units: Unit[],
    rosterUnits: RosterUnit[],
    terrainState: Terrain[],
    game: GameState,
    log: LogEntry[],
    selectedIds: string[],
    combatTargetId: string | null,
    combatQueue: QueuedAttack[],
    deployingUnitId: string | null,
    microMoveMode: { unitId: string, type: "pile-in" | "consolidate" } | null
  }
  const historyRef = useRef<Snapshot[]>([])
  const historyIndexRef = useRef<number>(-1)

  const saveHistory = () => {
    // Truncate future history if we're not at the end
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1)
    }
    // Push deep clone (shallow clone of arrays is usually fine, but game state has deep objects like VP/CP, we use JSON for safety/simplicity since it's small)
    const snapshot: Snapshot = JSON.parse(JSON.stringify({
      tokens,
      units,
      rosterUnits,
      terrainState,
      game,
      log,
      selectedIds,
      combatTargetId,
      combatQueue,
      deployingUnitId,
      microMoveMode
    }))
    historyRef.current.push(snapshot)
    // Keep max 50 history states to prevent memory leaks
    if (historyRef.current.length > 50) {
      historyRef.current.shift()
    } else {
      historyIndexRef.current++
    }
  }

  const undo = () => {
    if (historyIndexRef.current >= 0) {
      // If this is the very first undo, save current state to future history so we can redo back to it
      if (historyIndexRef.current === historyRef.current.length - 1) {
        saveHistory() // this pushes current state
        historyIndexRef.current-- // step back from the newly pushed state
      }
      
      const snapshot = historyRef.current[historyIndexRef.current]
      setTokens(snapshot.tokens)
      setUnits(snapshot.units)
      setRosterUnits(snapshot.rosterUnits)
      setTerrainState(snapshot.terrainState)
      setGame(snapshot.game)
      setLog(snapshot.log)
      setSelectedIds(snapshot.selectedIds)
      setCombatTargetId(snapshot.combatTargetId)
      setCombatQueue(snapshot.combatQueue || [])
      setDeployingUnitId(snapshot.deployingUnitId)
      setMicroMoveMode(snapshot.microMoveMode)
      
      historyIndexRef.current--
      if (historyIndexRef.current < -1) historyIndexRef.current = -1
    }
  }

  const redo = () => {
    if (historyIndexRef.current < historyRef.current.length - 2) {
      historyIndexRef.current++
      const snapshot = historyRef.current[historyIndexRef.current + 1]
      setTokens(snapshot.tokens)
      setUnits(snapshot.units)
      setRosterUnits(snapshot.rosterUnits)
      setTerrainState(snapshot.terrainState)
      setGame(snapshot.game)
      setLog(snapshot.log)
      setSelectedIds(snapshot.selectedIds)
      setCombatTargetId(snapshot.combatTargetId)
      setCombatQueue(snapshot.combatQueue || [])
      setDeployingUnitId(snapshot.deployingUnitId)
      setMicroMoveMode(snapshot.microMoveMode)
    }
  }

  const [isLoaded, setIsLoaded] = useState(false)
  const hasLoadedRef = useRef(false)

  // Load from Local Storage on mount
  useEffect(() => {
    if (hasLoadedRef.current) return;
    const saved = localStorage.getItem('wh4k_save')
    if (saved) {
      try {
        const data = JSON.parse(saved)
        if (data.tokens) setTokens(data.tokens)
        if (data.units) setUnits(data.units)
        if (data.rosterUnits) setRosterUnits(data.rosterUnits)
        if (data.terrainState) setTerrainState(data.terrainState)
        if (data.game) setGame(data.game)
        if (data.log) setLog(data.log)
      } catch (e) {
        console.error("Failed to load save", e)
      }
    }
    
    // Give React time to flush the state updates before enabling the save effect
    setTimeout(() => {
      hasLoadedRef.current = true;
      setIsLoaded(true);
    }, 200);
  }, [])

  // Save to Local Storage on change
  useEffect(() => {
    if (hasLoadedRef.current && isLoaded) {
      localStorage.setItem('wh4k_save', JSON.stringify({
        tokens,
        units,
        rosterUnits,
        terrainState,
        game,
        log
      }))
    }
  }, [tokens, units, rosterUnits, terrainState, game, log, isLoaded])

  const moveTokens = (moves: { id: string; x: number; y: number, z?: number }[]) => {
    saveHistory()
    setTokens((prev) => {
      const nextTokens = prev.map((t) => {
        const move = moves.find((m) => m.id === t.id)
        if (move) {
          return { ...t, x: move.x, y: move.y, z: move.z ?? t.z, moved: true }
        }
        return t
      })

      // Update unit.hasMoved ONLY if ALL tokens in the unit have moved
      setUnits((prevUnits) =>
        prevUnits.map((u) => {
          const unitTokens = nextTokens.filter((t) => t.unitId === u.id)
          const allMoved = unitTokens.length > 0 && unitTokens.every((t) => t.moved)
          return { ...u, hasMoved: allMoved }
        })
      )

      return nextTokens
    })
  }

  const moveTerrain = (moves: { id: string, dx: number, dy: number }[]) => {
    saveHistory()
    setTerrainState(prev => prev.map(t => {
      const move = moves.find(m => m.id === t.id)
      if (move) {
        return {
          ...t,
          points: t.points.map(p => ({ x: p.x + move.dx, y: p.y + move.dy })),
          platforms: t.platforms?.map(plat => ({
            ...plat,
            points: plat.points?.map(p => ({ x: p.x + move.dx, y: p.y + move.dy }))
          }))
        }
      }
      return t
    }))
  }

  const wound = (id: string, d: number) => {
    saveHistory()
    if (d < 0) {
      EventBus.emit('animate-damage', { targetId: id, damage: Math.abs(d) })
    }
    setTokens((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, currentWounds: Math.max(0, Math.min(t.stats.wounds, t.currentWounds + d)) } : t
      )
    )
  }

  const adjustVp = (f: FactionId, d: number) => { saveHistory(); setGame((g) => ({ ...g, vp: { ...g.vp, [f]: Math.max(0, g.vp[f] + d) } })) }
  const adjustCp = (f: FactionId, d: number) => { saveHistory(); setGame((g) => ({ ...g, cp: { ...g.cp, [f]: Math.max(0, g.cp[f] + d) } })) }

  const handleUseStratagem = (faction: string, cost: number, stratName: string) => {
    adjustCp(faction as FactionId, -cost)
    setLog(prev => [
      newLog({ kind: "info", faction: faction as FactionId, round: game.round, text: `Usada estratagema: ${stratName} (-${cost} PM).` }),
      ...prev
    ])
  }

  const resolveBatchAttacks = (results: any[]) => {
    saveHistory()
    const attackerFaction = game.activePlayer
    let logsToAdd: Omit<LogEntry, "id">[] = []

    setTokens(prevTokens => {
      let nextTokens = [...prevTokens]
      let unitsToClearEmbark: string[] = []

      for (const r of results) {
        const targetToken = nextTokens.find(t => t.id === r.targetId)
        
        // Trigger shooting & damage animations on Phaser 3D board
        if (r.attackerId && r.targetId) {
          EventBus.emit('animate-shoot', { attackerId: r.attackerId, targetId: r.targetId })
        } else if (r.targetId && r.totalDamage > 0) {
          EventBus.emit('animate-damage', { targetId: r.targetId, damage: r.totalDamage })
        }

        logsToAdd.push({
          kind: "attack",
          faction: attackerFaction,
          round: game.round,
          text: `${r.attackerName} \u2192 ${r.targetName} con ${r.weaponName}: ${r.hits} impactos / ${r.wounds} heridas / ${r.unsaved} no salvadas (${r.totalDamage} daño).`,
        })

        if (targetToken) {
          const remaining = Math.max(0, targetToken.currentWounds - r.totalDamage)
          if (remaining <= 0) {
            logsToAdd.push({ kind: "casualty", faction: attackerFaction, round: game.round, text: `${r.targetName} destruido.` })

            const ddAbility = targetToken.abilities?.find(a => a.startsWith("Deadly Demise"))
            if (ddAbility) {
              const ddRoll = rollD6()
              if (ddRoll === 6) {
                let dmgStr = ddAbility.split(" ")[2] || "1"
                let mwAmount = dmgStr === "D3" ? Math.ceil(rollD6() / 2) : parseInt(dmgStr)
                
                logsToAdd.push({ kind: "info", faction: targetToken.faction, round: game.round, text: `¡${r.targetName} explota (Final Violento)! Inflige ${mwAmount} heridas mortales a las unidades cercanas.` })

                nextTokens = nextTokens.map(t => {
                  if (t.id === targetToken.id) return t 
                  if (t.currentWounds <= 0) return t
                  const d = getDistanceBetweenTokens(t, targetToken)
                  if (d <= 6) {
                    return { ...t, currentWounds: Math.max(0, t.currentWounds - mwAmount) }
                  }
                  return t
                })
              }
            }

            const trUnit = units.find(u => u.id === targetToken.unitId)
            if (trUnit && trUnit.embarkedUnits && trUnit.embarkedUnits.length > 0) {
              trUnit.embarkedUnits.forEach(embId => {
                const embUnit = units.find(u => u.id === embId)
                if (embUnit) {
                  const embToks = nextTokens.filter(t => t.unitId === embId)
                  let offset = 0
                  let casualties = 0
                  embToks.forEach(et => {
                    if (rollD6() === 1) {
                      casualties++
                      const etIdx = nextTokens.findIndex(t => t.id === et.id)
                      if (etIdx >= 0) nextTokens[etIdx] = { ...nextTokens[etIdx], currentWounds: 0 }
                    } else {
                      const etIdx = nextTokens.findIndex(t => t.id === et.id)
                      if (etIdx >= 0) nextTokens[etIdx] = { ...nextTokens[etIdx], embarkedIn: undefined, x: targetToken.x + 2 + offset, y: targetToken.y + 2 + offset }
                      offset += 1
                    }
                  })
                  logsToAdd.push({ kind: "info", faction: embUnit.faction, round: game.round, text: `Desembarque de emergencia: ${embUnit.name} sale de los restos de ${trUnit.name}. Sufrió ${casualties} bajas.` })
                }
              })
              unitsToClearEmbark.push(trUnit.id)
            }

            nextTokens = nextTokens.filter(t => t.id !== targetToken.id)
          } else {
            nextTokens = nextTokens.map(t => t.id === targetToken.id ? { ...t, currentWounds: remaining } : t)
          }
        }
      }
      
      const collateralDead = nextTokens.filter(t => t.currentWounds <= 0)
      for (const dead of collateralDead) {
        logsToAdd.push({ kind: "casualty", faction: dead.faction, round: game.round, text: `${dead.name} destruido por explosión.` })
      }
      nextTokens = nextTokens.filter(t => t.currentWounds > 0)

      if (unitsToClearEmbark.length > 0) {
        setUnits(prevU => prevU.map(u => unitsToClearEmbark.includes(u.id) ? { ...u, embarkedUnits: [] } : u))
      }
      
      return nextTokens;
    })
    
    setLog(prev => [...logsToAdd.map(newLog), ...prev])
    setCombatQueue([])
    setCombatTargetId(null)
  }

  const resolveAttack = (r: any) => {
    saveHistory()
    const attackerFaction = game.activePlayer
    const targetToken = tokens.find(t => t.id === r.targetId)
    
    let logsToAdd: Omit<LogEntry, "id">[] = [
      {
        kind: "attack",
        faction: attackerFaction,
        round: game.round,
        text: `${r.attackerName} \u2192 ${r.targetName} con ${r.weaponName}: ${r.hits} impactos / ${r.wounds} heridas / ${r.unsaved} no salvadas (${r.totalDamage} daño).`,
      },
    ]

    let nextTokens = [...tokens]

    if (targetToken) {
      const remaining = Math.max(0, targetToken.currentWounds - r.totalDamage)
      if (remaining <= 0) {
        logsToAdd.push({ kind: "casualty", faction: attackerFaction, round: game.round, text: `${r.targetName} destruido.` })

        const ddAbility = targetToken.abilities?.find(a => a.startsWith("Deadly Demise"))
        if (ddAbility) {
          const ddRoll = rollD6()
          if (ddRoll === 6) {
            let dmgStr = ddAbility.split(" ")[2] || "1"
            let mwAmount = dmgStr === "D3" ? Math.ceil(rollD6() / 2) : parseInt(dmgStr)
            
            logsToAdd.push({ kind: "info", faction: targetToken.faction, round: game.round, text: `¡${r.targetName} explota (Final Violento)! Inflige ${mwAmount} heridas mortales a las unidades cercanas.` })

            nextTokens = nextTokens.map(t => {
              if (t.id === targetToken.id) return t 
              if (t.currentWounds <= 0) return t
              const d = getDistanceBetweenTokens(t, targetToken)
              if (d <= 6) {
                return { ...t, currentWounds: Math.max(0, t.currentWounds - mwAmount) }
              }
              return t
            })
          }
        }

        const trUnit = units.find(u => u.id === targetToken.unitId)
        if (trUnit && trUnit.embarkedUnits && trUnit.embarkedUnits.length > 0) {
          trUnit.embarkedUnits.forEach(embId => {
            const embUnit = units.find(u => u.id === embId)
            if (embUnit) {
              const embToks = nextTokens.filter(t => t.unitId === embId)
              let offset = 0
              let casualties = 0
              embToks.forEach(et => {
                if (rollD6() === 1) {
                  casualties++
                  const etIdx = nextTokens.findIndex(t => t.id === et.id)
                  if (etIdx >= 0) nextTokens[etIdx] = { ...nextTokens[etIdx], currentWounds: 0 }
                } else {
                  const etIdx = nextTokens.findIndex(t => t.id === et.id)
                  if (etIdx >= 0) nextTokens[etIdx] = { ...nextTokens[etIdx], embarkedIn: undefined, x: targetToken.x + 2 + offset, y: targetToken.y + 2 + offset }
                  offset += 1
                }
              })
              logsToAdd.push({ kind: "info", faction: embUnit.faction, round: game.round, text: `Desembarque de emergencia: ${embUnit.name} sale de los restos de ${trUnit.name}. Sufrió ${casualties} bajas.` })
            }
          })
          
          setUnits(prev => prev.map(u => u.id === trUnit.id ? { ...u, embarkedUnits: [] } : u))
        }

        nextTokens = nextTokens.filter(t => t.id !== targetToken.id)
      } else {
        nextTokens = nextTokens.map(t => t.id === targetToken.id ? { ...t, currentWounds: remaining } : t)
      }
    }
    
    const collateralDead = nextTokens.filter(t => t.currentWounds <= 0)
    for (const dead of collateralDead) {
      logsToAdd.push({ kind: "casualty", faction: dead.faction, round: game.round, text: `${dead.name} destruido por explosión.` })
    }
    nextTokens = nextTokens.filter(t => t.currentWounds > 0)

    setTokens(nextTokens)
    setLog(prev => [...logsToAdd.map(newLog), ...prev])
    if (r.slain) {
      if (combatTargetId === r.targetId) setCombatTargetId(null)
      setCombatQueue(q => q.filter(a => a.targetId !== r.targetId && a.attackerId !== r.targetId))
    }
  }

  const resolveCharge = (attackerId: string, targetId: string, distRoll: number, success: boolean) => {
    saveHistory()
    const attackerFaction = game.activePlayer
    const target = tokens.find(t => t.id === targetId)
    const att = tokens.find(t => t.id === attackerId)
    if (!target || !att) return

    setLog(prev => [
        newLog({ kind: "info", faction: attackerFaction, round: game.round, text: `${att.name} tiró ${distRoll}" para cargar a ${target.name}. ${success ? "¡Éxito!" : "Falló."}` }),
        ...prev
    ])
    
    if (success) {
      const dx = att.x - target.x
      const dy = att.y - target.y
      const d = Math.hypot(dx, dy)
      const targetR = target.baseMm / 25.4 / 2
      const attR = att.baseMm / 25.4 / 2
      const moveDist = d - (targetR + attR) - 0.9
      
      if (moveDist > 0) {
        const nx = att.x - (dx / d) * moveDist
        const ny = att.y - (dy / d) * moveDist
        setTokens(prev => prev.map(t => t.id === attackerId ? { ...t, x: nx, y: ny } : t))
        setUnits(prev => prev.map(u => u.id === att.unitId ? { ...u, hasCharged: true } : u))
      }
    }
  }

  const finishRoster = () => {
    saveHistory()
    const nextPhase = "deployment"
    setGame(g => ({ ...g, phase: nextPhase, activePlayer: "imperium" }))
    setLog(prev => [newLog({ kind: "phase", faction: "imperium", round: 1, text: `Despliegue completado. Comienza la fase de ${nextPhase}.` }), ...prev])
  }

  const deployUnit = (rosterUnitId: string, x: number, y: number) => {
    saveHistory()
    const rUnit = rosterUnits.find(r => r.id === rosterUnitId)
    if (!rUnit) return
    const ds = DATASHEETS.find(d => d.id === rUnit.datasheetId)
    if (!ds) return
    
    const { unit, tokens: newTokens } = createUnitFromDatasheet(ds, rosterUnitId, x, y)
    
    setUnits(prev => [...prev, unit])
    setTokens(prev => [...prev, ...newTokens])
    setRosterUnits(prev => prev.map(r => r.id === rosterUnitId ? { ...r, deployed: true } : r))
    setDeployingUnitId(null)
    
    const stillToDeploy = rosterUnits.filter(r => !r.deployed && r.id !== rosterUnitId)
    
    if (stillToDeploy.length === 0) {
      const nextPhase = "command"
      setGame(g => ({ ...g, phase: nextPhase, activePlayer: "imperium" }))
      setLog(prev => [newLog({ kind: "phase", faction: "imperium", round: 1, text: `Despliegue completado. Comienza la fase de ${nextPhase}.` }), ...prev])
    } else {
      const nextPlayer = game.activePlayer === "imperium" ? "chaos" : "imperium"
      if (stillToDeploy.some(r => r.faction === nextPlayer)) {
        setGame(g => ({ ...g, activePlayer: nextPlayer }))
      }
    }
    
    setLog(prev => [newLog({ kind: "info", faction: rUnit.faction, round: 1, text: `${ds.name} desplegado.` }), ...prev])
  }

  const doAdvanceUnit = (unitId: string) => {
    saveHistory()
    const roll = rollD6()
    const u = units.find(u => u.id === unitId)
    setUnits(prev => prev.map(u => u.id === unitId ? { ...u, advanced: true, advanceRoll: roll } : u))
    setLog(prev => [newLog({ kind: "info", faction: game.activePlayer, round: game.round, text: `${u?.name} avanzó +${roll}".` }), ...prev])
  }

  const doFallBackUnit = (unitId: string) => {
    saveHistory()
    const u = units.find(u => u.id === unitId)
    if (!u) return
    
    const isShocked = u.isBattleShocked
    let killed = 0
    let text = `${u.name} se retiró.`
    
    if (isShocked) {
      const aliveTokens = u.tokenIds.filter(tid => {
        const t = tokens.find(tok => tok.id === tid)
        return t && t.currentWounds > 0
      })
      
      const newTokens = [...tokens]
      aliveTokens.forEach(tid => {
        if (rollD6() <= 2) {
          killed++
          const tIdx = newTokens.findIndex(tok => tok.id === tid)
          if (tIdx >= 0) newTokens[tIdx] = { ...newTokens[tIdx], currentWounds: 0 }
        }
      })
      setTokens(newTokens)
      text += ` Al estar acobardada, sufrió ${killed} bajas por Huida Desesperada.`
    }
    
    setUnits(prev => prev.map(u => u.id === unitId ? { ...u, fellBack: true } : u))
    setLog(prev => [newLog({ kind: killed > 0 ? "casualty" : "info", faction: game.activePlayer, round: game.round, text }), ...prev])
  }

  const doMicroMove = (unitId: string, type: "pile-in" | "consolidate") => {
    saveHistory()
    setMicroMoveMode({ unitId, type })
    const label = type === "pile-in" ? "Apilar (Pile-in)" : "Reagrupar (Consolidar)"
    setLog(prev => [newLog({ kind: "info", faction: game.activePlayer, round: game.round, text: `Modo de micromovimiento activo para ${units.find(u => u.id === unitId)?.name}: ${label} hasta 3".` }), ...prev])
  }

  const doEmbark = (unitId: string) => {
    saveHistory()
    const u = units.find(u => u.id === unitId)
    if (!u) return
    const ts = tokens.filter(t => t.unitId === unitId && t.currentWounds > 0)
    const transports = units.filter(tr => tr.faction === u.faction && tr.transportCapacity && tr.transportCapacity > 0)
    let targetTransport: Unit | undefined
    for (const tr of transports) {
      const trTokens = tokens.filter(t => t.unitId === tr.id)
      if (trTokens.length === 0) continue
      const trTok = trTokens[0]
      if (ts.every(t => getDistanceBetweenTokens(t, trTok) <= 3)) {
        targetTransport = tr
        break
      }
    }

    if (targetTransport) {
      setUnits(prev => prev.map(p => p.id === targetTransport!.id ? { ...p, embarkedUnits: [...(p.embarkedUnits || []), unitId] } : p))
      setTokens(prev => prev.map(t => t.unitId === unitId ? { ...t, embarkedIn: targetTransport!.id, x: -100, y: -100 } : t))
      setLog(prev => [newLog({ kind: "info", faction: game.activePlayer, round: game.round, text: `${u.name} ha embarcado en ${targetTransport!.name}.` }), ...prev])
    }
  }

  const doDisembark = (transportUnitId: string) => {
    saveHistory()
    const tr = units.find(u => u.id === transportUnitId)
    if (!tr || !tr.embarkedUnits || tr.embarkedUnits.length === 0) return
    const trTok = tokens.find(t => t.unitId === transportUnitId)
    if (!trTok) return

    const embarkedId = tr.embarkedUnits[0]
    setUnits(prev => prev.map(p => p.id === transportUnitId ? { ...p, embarkedUnits: p.embarkedUnits!.filter(id => id !== embarkedId) } : p))
    
    setTokens(prev => {
      let next = [...prev]
      let offset = 0
      for (let i = 0; i < next.length; i++) {
        if (next[i].unitId === embarkedId) {
          next[i] = { ...next[i], embarkedIn: undefined, x: trTok.x + 2 + offset, y: trTok.y + 2 + offset }
          offset += 1
        }
      }
      return next
    })
    setLog(prev => [newLog({ kind: "info", faction: game.activePlayer, round: game.round, text: `Una unidad ha desembarcado de ${tr.name}.` }), ...prev])
  }

  const advance = (objectives: ReturnType<typeof makeObjectives>) => {
    saveHistory()
    const g = game
    const currentPhases = PHASES
    const i = currentPhases.indexOf(g.phase)
    
    if (i < currentPhases.length - 1) {
      const next = currentPhases[i + 1] as Phase
      setGame({ ...g, phase: next })
      setLog((l) => [newLog({ kind: "phase", faction: g.activePlayer, round: g.round, text: `Fase de ${next}.` }), ...l])
    } else {
      const nextPlayer: FactionId = (g.activePlayer === "imperium" ? "chaos" : "imperium")
      const nextRound = nextPlayer === "imperium" ? g.round + 1 : g.round
      
      const newLogs: LogEntry[] = []
      const newTokensList = [...tokens]
      
      units.forEach(u => {
        if (u.faction === g.activePlayer) {
          const aliveTokens = u.tokenIds.filter(tid => {
            const t = newTokensList.find(tok => tok.id === tid)
            return t && t.currentWounds > 0
          })
          
          if (aliveTokens.length > 1) {
            let removedCount = 0
            aliveTokens.forEach(tid => {
              const t1 = newTokensList.find(tok => tok.id === tid)!
              let closeCount = 0
              aliveTokens.forEach(oid => {
                if (tid !== oid) {
                  const t2 = newTokensList.find(tok => tok.id === oid)!
                  if (getDistanceBetweenTokens(t1, t2) <= 2) closeCount++
                }
              })
              const required = aliveTokens.length >= 7 ? 2 : 1
              if (closeCount < required) {
                const tIdx = newTokensList.findIndex(tok => tok.id === tid)
                if (tIdx >= 0) {
                  newTokensList[tIdx] = { ...newTokensList[tIdx], currentWounds: 0 }
                  removedCount++
                }
              }
            })
            if (removedCount > 0) {
              newLogs.push(newLog({ kind: "casualty", faction: g.activePlayer, round: g.round, text: `${u.name} perdió ${removedCount} miniatura(s) por estar fuera de coherencia de unidad.` }))
            }
          }
        }
      })
      setTokens(newTokensList)
      
      let vpGained = 0
      const nextPhase = "command"
      setGame(g => ({ ...g, phase: nextPhase, activePlayer: nextPlayer, round: nextRound }))
      newLogs.push(newLog({ kind: "phase", faction: nextPlayer, round: nextRound, text: `Ronda ${nextRound} \u2014 Fase de ${nextPhase}.` }))

      if (nextRound > 1) {
        objectives.forEach(obj => {
          let impOc = 0
          let chaOc = 0
          tokens.forEach(t => {
            if (t.currentWounds > 0) {
              const u = units.find(u => u.id === t.unitId)
              let oc = t.stats.oc
              if (u?.isBattleShocked) oc = 0
              if (Math.hypot(t.x - obj.x, t.y - obj.y) <= 3) {
                if (t.faction === "imperium") impOc += oc
                else chaOc += oc
              }
            }
          })
          
          if (impOc > chaOc && nextPlayer === "imperium") vpGained += 5
          if (chaOc > impOc && nextPlayer === "chaos") vpGained += 5
        })
      }

        const nextUnits = units.map(u => {
          if (u.faction !== nextPlayer) return u
          const aliveTokens = u.tokenIds.filter(tid => {
            const t = tokens.find(tok => tok.id === tid)
            return t && t.currentWounds > 0
          })
          const isUnderHalf = aliveTokens.length < u.startingTokens / 2
          let shocked = false
          if (isUnderHalf) {
            const roll = rollD6() + rollD6()
            const firstToken = tokens.find(t => t.id === aliveTokens[0])
            const ld = firstToken?.stats.leadership || 6
            if (roll < ld) {
              shocked = true
              newLogs.push(newLog({ kind: "info", faction: nextPlayer, round: nextRound, text: `${u.name} falló Acobardamiento (${roll} < ${ld}). Su OC ahora es 0.` }))
            } else {
              newLogs.push(newLog({ kind: "info", faction: nextPlayer, round: nextRound, text: `${u.name} superó Acobardamiento (${roll} >= ${ld}).` }))
            }
          }
          return { ...u, isBattleShocked: shocked, hasFought: false, hasCharged: false }
        })
        setUnits(nextUnits)
        setUnits(nextUnits)

      // Calculate total VPs
      const nextVp = { ...g.vp, [nextPlayer]: g.vp[nextPlayer] + vpGained }

      // Check Warlord / Annihilation & Round 5 End Game Victory Conditions
      let winner: FactionId | "draw" | null = null
      let victoryReason: string | undefined = undefined

      // Check if one faction has been completely wiped out (Aniquilación)
      const aliveTokensImperium = tokens.filter(t => t.faction === "imperium" && t.currentWounds > 0).length
      const aliveTokensChaos = tokens.filter(t => t.faction === "chaos" && t.currentWounds > 0).length

      if (aliveTokensImperium === 0 && aliveTokensChaos > 0) {
        winner = "chaos"
        victoryReason = "¡Aniquilación Total! Las fuerzas del Imperio han sido totalmente exterminadas."
      } else if (aliveTokensChaos === 0 && aliveTokensImperium > 0) {
        winner = "imperium"
        victoryReason = "¡Aniquilación Total! Las fuerzas del Caos han sido totalmente exterminadas."
      } else if (nextRound > 5 && g.phase === "fight" && nextPlayer === "chaos") {
        // End of Round 5 (Chaos turn end)
        if (nextVp.imperium > nextVp.chaos) {
          winner = "imperium"
          victoryReason = `¡Victoria Imperial por Puntos de Victoria! (${nextVp.imperium} PV vs ${nextVp.chaos} PV)`
        } else if (nextVp.chaos > nextVp.imperium) {
          winner = "chaos"
          victoryReason = `¡Victoria del Caos por Puntos de Victoria! (${nextVp.chaos} PV vs ${nextVp.imperium} PV)`
        } else {
          winner = "draw"
          victoryReason = `¡Empate Estratégico! Ambos ejércitos acumularon ${nextVp.imperium} PV al final de la Ronda 5.`
        }
      }

      setGame({
        ...g,
        phase: nextPhase as Phase,
        activePlayer: nextPlayer,
        round: nextRound,
        vp: nextVp,
        cp: { ...g.cp, [nextPlayer]: g.cp[nextPlayer] + 1 },
        winner,
        victoryReason
      })
      
      if (winner) {
        newLogs.push(newLog({ kind: "info", faction: winner === "draw" ? undefined : winner, round: g.round, text: victoryReason || "¡Fin de la Batalla!" }))
      } else if (vpGained > 0) {
        newLogs.push(newLog({ kind: "info", faction: nextPlayer, round: nextRound, text: `${FACTIONS[nextPlayer].name} controla objetivos y gana ${vpGained} PV.` }))
      }

      setLog(l => [...newLogs.reverse(), ...l])
    }
    
    setTokens((prev) => prev.map((t) => ({ ...t, moved: false })))
    setUnits((prev) => prev.map((u) => ({ ...u, advanced: false, advanceRoll: undefined, fellBack: false, hasMoved: false })))
    setCombatTargetId(null)
  }

  const reset = () => {
    localStorage.removeItem('wh4k_save')
    setTokens([])
    setUnits([])
    setRosterUnits([])
    setTerrainState(makeInitialTerrain("custom"))
    setSelectedIds([])
    setCombatTargetId(null)
    setLog([])
    setGame({
      terrainLayout: "custom",
      round: 1,
      activePlayer: "imperium",
      phase: "roster",
      vp: { imperium: 0, chaos: 0 },
      cp: { imperium: 1, chaos: 1 },
      pointsLimit: 500
    })
  }

  const queueAttack = (attackerId: string, targetId: string) => {
    if (game.phase !== 'shooting' && game.phase !== 'fight') return;
    saveHistory()
    setCombatQueue(prev => {
      if (prev.some(a => a.attackerId === attackerId && a.targetId === targetId && a.phase === game.phase)) return prev;
      return [...prev, { attackerId, targetId, phase: game.phase as 'shooting' | 'fight', weaponIdx: 0 }]
    })
  }

  const updateQueuedAttackWeapon = (attackerId: string, targetId: string, weaponIdx: number) => {
    setCombatQueue(prev => prev.map(a => 
      a.attackerId === attackerId && a.targetId === targetId && a.phase === game.phase 
        ? { ...a, weaponIdx } 
        : a
    ))
  }

  const dequeueAttack = () => {
    saveHistory()
    setCombatQueue(prev => prev.slice(1))
  }

  const removeAttack = (attackerId: string, targetId: string) => {
    saveHistory()
    setCombatQueue(prev => prev.filter(a => !(a.attackerId === attackerId && a.targetId === targetId)))
  }

  return {
    // State
    tokens, setTokens,
    units, setUnits,
    rosterUnits, setRosterUnits,
    terrainState, setTerrainState,
    selectedIds, setSelectedIds,
    combatTargetId, setCombatTargetId,
    combatQueue, setCombatQueue,
    deployingUnitId, setDeployingUnitId,
    microMoveMode, setMicroMoveMode,
    log, setLog,
    game, setGame,
    isLoaded,
    
    // Actions
    moveTokens,
    moveTerrain,
    wound,
    adjustVp,
    adjustCp,
    handleUseStratagem,
    resolveAttack,
    resolveBatchAttacks,
    resolveCharge,
    finishRoster,
    deployUnit,
    doAdvanceUnit,
    doFallBackUnit,
    doMicroMove,
    doEmbark,
    doDisembark,
    advance,
    reset,
    undo,
    redo,
    queueAttack,
    dequeueAttack,
    removeAttack,
    updateQueuedAttackWeapon
  };
}
