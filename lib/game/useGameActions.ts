import { useEffect } from 'react';
import { useGameStore } from "../store/gameStore";
import { useUIStore } from "../store/uiStore";
import { makeInitialTerrain } from "./constants";
import type { LogEntry, FactionId } from "./types";
import { useCombatEngine } from "./hooks/useCombatEngine";
import { useMovementEngine } from "./hooks/useMovementEngine";
import { usePhaseEngine } from "./hooks/usePhaseEngine";

const newLog = (e: Omit<LogEntry, "id">): LogEntry => ({ ...e, id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` });

export function useGameActions() {
  const combatEngine = useCombatEngine();
  const movementEngine = useMovementEngine();
  const phaseEngine = usePhaseEngine();

  const handleUseStratagem = (faction: string, cost: number, stratName: string) => {
    const store = useGameStore.getState();
    store.adjustCp(faction as FactionId, -cost)
    store.setLog(prev => [
      newLog({ kind: "info", faction: faction as FactionId, round: store.game.round, text: `Usada estratagema: ${stratName} (-${cost} PM).` }),
      ...prev
    ])
  }

  return {
    ...combatEngine,
    ...movementEngine,
    ...phaseEngine,
    handleUseStratagem,
    // Provide stable references to Zustand actions directly from getState()
    setDeployingUnitId: useUIStore.getState().setDeployingUnitId,
    setCombatTargetId: useUIStore.getState().setCombatTargetId,
    setMicroMoveMode: useUIStore.getState().setMicroMoveMode,
    setSelectedIds: useUIStore.getState().setSelectedIds,
    undo: useGameStore.getState().undo,
    redo: useGameStore.getState().redo,
    reset: useGameStore.getState().reset,
    adjustVp: useGameStore.getState().adjustVp,
    adjustCp: useGameStore.getState().adjustCp,
    setRosterUnits: useGameStore.getState().setRosterUnits,
    setGame: useGameStore.getState().setGame,
    moveTokens: useGameStore.getState().moveTokens,
    moveTerrain: useGameStore.getState().moveTerrain,
  };
}
