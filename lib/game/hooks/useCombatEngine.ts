import { useGameStore } from "../../store/gameStore";
import { useUIStore } from "../../store/uiStore";
import { rollD6, getDistanceBetweenTokens } from "../utils";
import { EventBus } from "../EventBus";
import type { LogEntry } from "../types";

const newLog = (e: Omit<LogEntry, "id">): LogEntry => ({ ...e, id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` });

export function useCombatEngine() {
  const uiStore = useUIStore();

  const resolveBatchAttacks = (results: any[]) => {
    const store = useGameStore.getState();
    store.saveHistory();
    const attackerFaction = store.game.activePlayer;
    let logsToAdd: Omit<LogEntry, "id">[] = [];

    store.setTokens(prevTokens => {
      let nextTokens = [...prevTokens];
      let unitsToClearEmbark: string[] = [];

      for (const r of results) {
        const targetToken = nextTokens.find(t => t.id === r.targetId);
        
        if (r.attackerId && r.targetId) {
          EventBus.emit('animate-shoot', { attackerId: r.attackerId, targetId: r.targetId });
        } else if (r.targetId && r.totalDamage > 0) {
          EventBus.emit('animate-damage', { targetId: r.targetId, damage: r.totalDamage });
        }

        logsToAdd.push({
          kind: "attack",
          faction: attackerFaction,
          round: store.game.round,
          text: `${r.attackerName} \u2192 ${r.targetName} con ${r.weaponName}: ${r.hits} impactos / ${r.wounds} heridas / ${r.unsaved} no salvadas (${r.totalDamage} daño).`,
        });

        if (targetToken) {
          const remaining = Math.max(0, targetToken.currentWounds - r.totalDamage);
          if (remaining <= 0) {
            logsToAdd.push({ kind: "casualty", faction: attackerFaction, round: store.game.round, text: `${r.targetName} destruido.` });

            const ddAbility = targetToken.abilities?.find(a => a.startsWith("Deadly Demise"));
            if (ddAbility) {
              const ddRoll = rollD6();
              if (ddRoll === 6) {
                let dmgStr = ddAbility.split(" ")[2] || "1";
                let mwAmount = dmgStr === "D3" ? Math.ceil(rollD6() / 2) : parseInt(dmgStr);
                
                logsToAdd.push({ kind: "info", faction: targetToken.faction, round: store.game.round, text: `¡${r.targetName} explota (Final Violento)! Inflige ${mwAmount} heridas mortales a las unidades cercanas.` });

                nextTokens = nextTokens.map(t => {
                  if (t.id === targetToken.id) return t;
                  if (t.currentWounds <= 0) return t;
                  const d = getDistanceBetweenTokens(t, targetToken);
                  if (d <= 6) {
                    return { ...t, currentWounds: Math.max(0, t.currentWounds - mwAmount) };
                  }
                  return t;
                });
              }
            }

            const trUnit = store.units.find(u => u.id === targetToken.unitId);
            if (trUnit && trUnit.embarkedUnits && trUnit.embarkedUnits.length > 0) {
              trUnit.embarkedUnits.forEach(embId => {
                const embUnit = store.units.find(u => u.id === embId);
                if (embUnit) {
                  const embToks = nextTokens.filter(t => t.unitId === embId);
                  let offset = 0;
                  let casualties = 0;
                  embToks.forEach(et => {
                    if (rollD6() === 1) {
                      casualties++;
                      const etIdx = nextTokens.findIndex(t => t.id === et.id);
                      if (etIdx >= 0) nextTokens[etIdx] = { ...nextTokens[etIdx], currentWounds: 0 };
                    } else {
                      const etIdx = nextTokens.findIndex(t => t.id === et.id);
                      if (etIdx >= 0) nextTokens[etIdx] = { ...nextTokens[etIdx], embarkedIn: undefined, x: targetToken.x + 2 + offset, y: targetToken.y + 2 + offset };
                      offset += 1;
                    }
                  });
                  logsToAdd.push({ kind: "info", faction: embUnit.faction, round: store.game.round, text: `Desembarque de emergencia: ${embUnit.name} sale de los restos de ${trUnit.name}. Sufrió ${casualties} bajas.` });
                }
              });
              unitsToClearEmbark.push(trUnit.id);
            }

            nextTokens = nextTokens.filter(t => t.id !== targetToken.id);
          } else {
            nextTokens = nextTokens.map(t => t.id === targetToken.id ? { ...t, currentWounds: remaining } : t);
          }
        }
      }
      
      const collateralDead = nextTokens.filter(t => t.currentWounds <= 0);
      for (const dead of collateralDead) {
        logsToAdd.push({ kind: "casualty", faction: dead.faction, round: store.game.round, text: `${dead.name} destruido por explosión.` });
      }
      nextTokens = nextTokens.filter(t => t.currentWounds > 0);

      if (unitsToClearEmbark.length > 0) {
        store.setUnits(prevU => prevU.map(u => unitsToClearEmbark.includes(u.id) ? { ...u, embarkedUnits: [] } : u));
      }
      
      return nextTokens;
    });
    
    store.setLog(prev => [...logsToAdd.map(newLog), ...prev]);
    uiStore.setCombatQueue([]);
    uiStore.setCombatTargetId(null);
  };

  const resolveAttack = (r: any) => {
    const store = useGameStore.getState();
    store.saveHistory();
    const attackerFaction = store.game.activePlayer;
    const targetToken = store.tokens.find(t => t.id === r.targetId);
    
    let logsToAdd: Omit<LogEntry, "id">[] = [
      {
        kind: "attack",
        faction: attackerFaction,
        round: store.game.round,
        text: `${r.attackerName} \u2192 ${r.targetName} con ${r.weaponName}: ${r.hits} impactos / ${r.wounds} heridas / ${r.unsaved} no salvadas (${r.totalDamage} daño).`,
      },
    ];

    let nextTokens = [...store.tokens];

    if (targetToken) {
      const remaining = Math.max(0, targetToken.currentWounds - r.totalDamage);
      if (remaining <= 0) {
        logsToAdd.push({ kind: "casualty", faction: attackerFaction, round: store.game.round, text: `${r.targetName} destruido.` });

        const ddAbility = targetToken.abilities?.find(a => a.startsWith("Deadly Demise"));
        if (ddAbility) {
          const ddRoll = rollD6();
          if (ddRoll === 6) {
            let dmgStr = ddAbility.split(" ")[2] || "1";
            let mwAmount = dmgStr === "D3" ? Math.ceil(rollD6() / 2) : parseInt(dmgStr);
            
            logsToAdd.push({ kind: "info", faction: targetToken.faction, round: store.game.round, text: `¡${r.targetName} explota (Final Violento)! Inflige ${mwAmount} heridas mortales a las unidades cercanas.` });

            nextTokens = nextTokens.map(t => {
              if (t.id === targetToken.id) return t;
              if (t.currentWounds <= 0) return t;
              const d = getDistanceBetweenTokens(t, targetToken);
              if (d <= 6) {
                return { ...t, currentWounds: Math.max(0, t.currentWounds - mwAmount) };
              }
              return t;
            });
          }
        }

        const trUnit = store.units.find(u => u.id === targetToken.unitId);
        if (trUnit && trUnit.embarkedUnits && trUnit.embarkedUnits.length > 0) {
          trUnit.embarkedUnits.forEach(embId => {
            const embUnit = store.units.find(u => u.id === embId);
            if (embUnit) {
              const embToks = nextTokens.filter(t => t.unitId === embId);
              let offset = 0;
              let casualties = 0;
              embToks.forEach(et => {
                if (rollD6() === 1) {
                  casualties++;
                  const etIdx = nextTokens.findIndex(t => t.id === et.id);
                  if (etIdx >= 0) nextTokens[etIdx] = { ...nextTokens[etIdx], currentWounds: 0 };
                } else {
                  const etIdx = nextTokens.findIndex(t => t.id === et.id);
                  if (etIdx >= 0) nextTokens[etIdx] = { ...nextTokens[etIdx], embarkedIn: undefined, x: targetToken.x + 2 + offset, y: targetToken.y + 2 + offset };
                  offset += 1;
                }
              });
              logsToAdd.push({ kind: "info", faction: embUnit.faction, round: store.game.round, text: `Desembarque de emergencia: ${embUnit.name} sale de los restos de ${trUnit.name}. Sufrió ${casualties} bajas.` });
            }
          });
          
          store.setUnits(prev => prev.map(u => u.id === trUnit.id ? { ...u, embarkedUnits: [] } : u));
        }

        nextTokens = nextTokens.filter(t => t.id !== targetToken.id);
      } else {
        nextTokens = nextTokens.map(t => t.id === targetToken.id ? { ...t, currentWounds: remaining } : t);
      }
    }
    
    const collateralDead = nextTokens.filter(t => t.currentWounds <= 0);
    for (const dead of collateralDead) {
      logsToAdd.push({ kind: "casualty", faction: dead.faction, round: store.game.round, text: `${dead.name} destruido por explosión.` });
    }
    nextTokens = nextTokens.filter(t => t.currentWounds > 0);

    store.setTokens(nextTokens);
    store.setLog(prev => [...logsToAdd.map(newLog), ...prev]);
    if (r.slain) {
      if (uiStore.combatTargetId === r.targetId) uiStore.setCombatTargetId(null);
      uiStore.setCombatQueue((q: any[]) => q.filter((a: any) => a.targetId !== r.targetId && a.attackerId !== r.targetId));
    }
  };

  const queueAttack = (attackerId: string, targetId: string) => {
    const store = useGameStore.getState();
    if (store.game.phase !== 'shooting' && store.game.phase !== 'fight') return;
    store.saveHistory();
    uiStore.setCombatQueue((prev: any[]) => {
      if (prev.some((a: any) => a.attackerId === attackerId && a.targetId === targetId && a.phase === store.game.phase)) return prev;
      return [...prev, { attackerId, targetId, phase: store.game.phase as 'shooting' | 'fight', weaponIdx: 0 }];
    });
  };

  const updateQueuedAttackWeapon = (attackerId: string, targetId: string, weaponIdx: number) => {
    const store = useGameStore.getState();
    uiStore.setCombatQueue((prev: any[]) => prev.map((a: any) => 
      a.attackerId === attackerId && a.targetId === targetId && a.phase === store.game.phase 
        ? { ...a, weaponIdx } 
        : a
    ));
  };

  const dequeueAttack = () => {
    const store = useGameStore.getState();
    store.saveHistory();
    uiStore.setCombatQueue((prev: any[]) => prev.slice(1));
  };

  const removeAttack = (attackerId: string, targetId: string) => {
    const store = useGameStore.getState();
    store.saveHistory();
    uiStore.setCombatQueue((prev: any[]) => prev.filter((a: any) => !(a.attackerId === attackerId && a.targetId === targetId)));
  };

  return {
    resolveBatchAttacks,
    resolveAttack,
    queueAttack,
    updateQueuedAttackWeapon,
    dequeueAttack,
    removeAttack
  };
}
