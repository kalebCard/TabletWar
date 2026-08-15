import { useGameStore } from "../../store/gameStore";
import { useUIStore } from "../../store/uiStore";
import { rollD6, getDistanceBetweenTokens } from "../utils";
import { DATASHEETS, FACTIONS, createUnitFromDatasheet, makeObjectives } from "../constants";
import { PHASES, Phase, FactionId, LogEntry } from "../types";

const newLog = (e: Omit<LogEntry, "id">): LogEntry => ({ ...e, id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` });

export function usePhaseEngine() {
  const uiStore = useUIStore();

  const finishRoster = () => {
    const store = useGameStore.getState();
    store.saveHistory();
    const nextPhase = "deployment";
    store.setGame(g => ({ ...g, phase: nextPhase, activePlayer: "imperium" }));
    store.setLog(prev => [newLog({ kind: "phase", faction: "imperium", round: 1, text: `Despliegue completado. Comienza la fase de ${nextPhase}.` }), ...prev]);
  };

  const deployUnit = (rosterUnitId: string, x: number, y: number) => {
    const store = useGameStore.getState();
    store.saveHistory();
    const rUnit = store.rosterUnits.find(r => r.id === rosterUnitId);
    if (!rUnit) return;
    const ds = DATASHEETS.find(d => d.id === rUnit.datasheetId);
    if (!ds) return;
    
    const { unit, tokens: newTokens } = createUnitFromDatasheet(ds, rosterUnitId, x, y);
    
    store.setUnits(prev => [...prev, unit]);
    store.setTokens(prev => [...prev, ...newTokens]);
    store.setRosterUnits(prev => prev.map(r => r.id === rosterUnitId ? { ...r, deployed: true } : r));
    uiStore.setDeployingUnitId(null);
    
    const stillToDeploy = store.rosterUnits.filter(r => !r.deployed && r.id !== rosterUnitId);
    
    if (stillToDeploy.length === 0) {
      const nextPhase = "command";
      store.setGame(g => ({ ...g, phase: nextPhase, activePlayer: "imperium" }));
      store.setLog(prev => [newLog({ kind: "phase", faction: "imperium", round: 1, text: `Despliegue completado. Comienza la fase de ${nextPhase}.` }), ...prev]);
    } else {
      const nextPlayer = store.game.activePlayer === "imperium" ? "chaos" : "imperium";
      if (stillToDeploy.some(r => r.faction === nextPlayer)) {
        store.setGame(g => ({ ...g, activePlayer: nextPlayer }));
      }
    }
    
    store.setLog(prev => [newLog({ kind: "info", faction: rUnit.faction, round: 1, text: `${ds.name} desplegado.` }), ...prev]);
  };

  const advance = (objectives: ReturnType<typeof makeObjectives>) => {
    const store = useGameStore.getState();
    store.saveHistory();
    const g = store.game;
    const currentPhases = PHASES;
    const i = currentPhases.indexOf(g.phase);
    
    if (i < currentPhases.length - 1) {
      const next = currentPhases[i + 1] as Phase;
      store.setGame({ ...g, phase: next });
      store.setLog((l) => [newLog({ kind: "phase", faction: g.activePlayer, round: g.round, text: `Fase de ${next}.` }), ...l]);
    } else {
      const nextPlayer: FactionId = (g.activePlayer === "imperium" ? "chaos" : "imperium");
      const nextRound = nextPlayer === "imperium" ? g.round + 1 : g.round;
      
      const newLogs: LogEntry[] = [];
      const newTokensList = [...store.tokens];
      
      store.units.forEach(u => {
        if (u.faction === g.activePlayer) {
          const aliveTokens = u.tokenIds.filter(tid => {
            const t = newTokensList.find(tok => tok.id === tid);
            return t && t.currentWounds > 0;
          });
          
          if (aliveTokens.length > 1) {
            let removedCount = 0;
            aliveTokens.forEach(tid => {
              const t1 = newTokensList.find(tok => tok.id === tid)!;
              let closeCount = 0;
              aliveTokens.forEach(oid => {
                if (tid !== oid) {
                  const t2 = newTokensList.find(tok => tok.id === oid)!;
                  if (getDistanceBetweenTokens(t1, t2) <= 2) closeCount++;
                }
              });
              const required = aliveTokens.length >= 7 ? 2 : 1;
              if (closeCount < required) {
                const tIdx = newTokensList.findIndex(tok => tok.id === tid);
                if (tIdx >= 0) {
                  newTokensList[tIdx] = { ...newTokensList[tIdx], currentWounds: 0 };
                  removedCount++;
                }
              }
            });
            if (removedCount > 0) {
              newLogs.push(newLog({ kind: "casualty", faction: g.activePlayer, round: g.round, text: `${u.name} perdió ${removedCount} miniatura(s) por estar fuera de coherencia de unidad.` }));
            }
          }
        }
      });
      store.setTokens(newTokensList);
      
      let vpGained = 0;
      const nextPhase = "command";
      store.setGame(g => ({ ...g, phase: nextPhase, activePlayer: nextPlayer, round: nextRound }));
      newLogs.push(newLog({ kind: "phase", faction: nextPlayer, round: nextRound, text: `Ronda ${nextRound} \u2014 Fase de ${nextPhase}.` }));

      if (nextRound > 1) {
        objectives.forEach(obj => {
          let impOc = 0;
          let chaOc = 0;
          store.tokens.forEach(t => {
            if (t.currentWounds > 0) {
              const u = store.units.find(u => u.id === t.unitId);
              let oc = t.stats.oc;
              if (u?.isBattleShocked) oc = 0;
              if (Math.hypot(t.x - obj.x, t.y - obj.y) <= 3) {
                if (t.faction === "imperium") impOc += oc;
                else chaOc += oc;
              }
            }
          });
          
          if (impOc > chaOc && nextPlayer === "imperium") vpGained += 5;
          if (chaOc > impOc && nextPlayer === "chaos") vpGained += 5;
        });
      }

      const nextUnits = store.units.map(u => {
        if (u.faction !== nextPlayer) return u;
        const aliveTokens = u.tokenIds.filter(tid => {
          const t = store.tokens.find(tok => tok.id === tid);
          return t && t.currentWounds > 0;
        });
        const isUnderHalf = aliveTokens.length < u.startingTokens / 2;
        let shocked = false;
        if (isUnderHalf) {
          const roll = rollD6() + rollD6();
          const firstToken = store.tokens.find(t => t.id === aliveTokens[0]);
          const ld = firstToken?.stats.leadership || 6;
          if (roll < ld) {
            shocked = true;
            newLogs.push(newLog({ kind: "info", faction: nextPlayer, round: nextRound, text: `${u.name} falló Acobardamiento (${roll} < ${ld}). Su OC ahora es 0.` }));
          } else {
            newLogs.push(newLog({ kind: "info", faction: nextPlayer, round: nextRound, text: `${u.name} superó Acobardamiento (${roll} >= ${ld}).` }));
          }
        }
        return { ...u, isBattleShocked: shocked, hasFought: false, hasCharged: false };
      });
      store.setUnits(nextUnits);

      const nextVp = { ...g.vp, [nextPlayer]: g.vp[nextPlayer] + vpGained };

      let winner: FactionId | "draw" | null = null;
      let victoryReason: string | undefined = undefined;

      const aliveTokensImperium = store.tokens.filter(t => t.faction === "imperium" && t.currentWounds > 0).length;
      const aliveTokensChaos = store.tokens.filter(t => t.faction === "chaos" && t.currentWounds > 0).length;

      if (aliveTokensImperium === 0 && aliveTokensChaos > 0) {
        winner = "chaos";
        victoryReason = "¡Aniquilación Total! Las fuerzas del Imperio han sido totalmente exterminadas.";
      } else if (aliveTokensChaos === 0 && aliveTokensImperium > 0) {
        winner = "imperium";
        victoryReason = "¡Aniquilación Total! Las fuerzas del Caos han sido totalmente exterminadas.";
      } else if (nextRound > 5 && g.phase === "fight" && nextPlayer === "chaos") {
        if (nextVp.imperium > nextVp.chaos) {
          winner = "imperium";
          victoryReason = `¡Victoria Imperial por Puntos de Victoria! (${nextVp.imperium} PV vs ${nextVp.chaos} PV)`;
        } else if (nextVp.chaos > nextVp.imperium) {
          winner = "chaos";
          victoryReason = `¡Victoria del Caos por Puntos de Victoria! (${nextVp.chaos} PV vs ${nextVp.imperium} PV)`;
        } else {
          winner = "draw";
          victoryReason = `¡Empate Estratégico! Ambos ejércitos acumularon ${nextVp.imperium} PV al final de la Ronda 5.`;
        }
      }

      store.setGame({
        ...g,
        phase: nextPhase as Phase,
        activePlayer: nextPlayer,
        round: nextRound,
        vp: nextVp,
        cp: { ...g.cp, [nextPlayer]: g.cp[nextPlayer] + 1 },
        winner,
        victoryReason
      });
      
      if (winner) {
        newLogs.push(newLog({ kind: "info", faction: winner === "draw" ? undefined : winner, round: g.round, text: victoryReason || "¡Fin de la Batalla!" }));
      } else if (vpGained > 0) {
        newLogs.push(newLog({ kind: "info", faction: nextPlayer, round: nextRound, text: `${FACTIONS[nextPlayer].name} controla objetivos y gana ${vpGained} PV.` }));
      }

      store.setLog(l => [...newLogs.reverse(), ...l]);
    }
    
    store.setTokens((prev) => prev.map((t) => ({ ...t, moved: false })));
    store.setUnits((prev) => prev.map((u) => ({ ...u, advanced: false, advanceRoll: undefined, fellBack: false, hasMoved: false })));
    uiStore.setCombatTargetId(null);
  };

  return {
    finishRoster,
    deployUnit,
    advance
  };
}
