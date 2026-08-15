import { useGameStore } from "../../store/gameStore";
import { useUIStore } from "../../store/uiStore";
import { rollD6, getDistanceBetweenTokens } from "../utils";
import { EventBus } from "../EventBus";
import type { LogEntry, Unit } from "../types";

const generateLogId = () => `log-${Date.now()}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)}`;

const createLog = (entry: Omit<LogEntry, "id">): LogEntry => ({
  ...entry,
  id: generateLogId()
});

const CONSTANTS = {
  MM_TO_INCHES: 25.4,
  ENGAGE_DISTANCE: 0.9,
  DISEMBARK_OFFSET: 2,
  MAX_FALLBACK_DEATH_ROLL: 2,
  EMBARK_RANGE: 3,
};

export function useMovementEngine() {
  const uiStore = useUIStore();

  const resolveCharge = (attackerId: string, targetId: string, distanceRolled: number, isSuccessful: boolean) => {
    const store = useGameStore.getState();
    store.saveHistory();
    
    const { activePlayer, round } = store.game;
    const targetToken = store.tokens.find(t => t.id === targetId);
    const attackerToken = store.tokens.find(t => t.id === attackerId);
    
    if (!targetToken || !attackerToken) return;

    const logText = `${attackerToken.name} tiró ${distanceRolled}" para cargar a ${targetToken.name}. ${isSuccessful ? "¡Éxito!" : "Falló."}`;
    store.setLog(prev => [createLog({ kind: "info", faction: activePlayer, round, text: logText }), ...prev]);
    
    if (isSuccessful) {
      const deltaX = attackerToken.x - targetToken.x;
      const deltaY = attackerToken.y - targetToken.y;
      const distance = Math.hypot(deltaX, deltaY);
      
      const targetRadius = (targetToken.baseMm / CONSTANTS.MM_TO_INCHES) / 2;
      const attackerRadius = (attackerToken.baseMm / CONSTANTS.MM_TO_INCHES) / 2;
      const moveDistance = distance - (targetRadius + attackerRadius) - CONSTANTS.ENGAGE_DISTANCE;
      
      if (moveDistance > 0) {
        const newX = attackerToken.x - (deltaX / distance) * moveDistance;
        const newY = attackerToken.y - (deltaY / distance) * moveDistance;
        
        EventBus.emit("charge-animation", attackerId, newX, newY);
        
        store.setTokens(prev => prev.map(t => t.id === attackerId ? { ...t, x: newX, y: newY } : t));
        store.setUnits(prev => prev.map(u => u.id === attackerToken.unitId ? { ...u, hasCharged: true } : u));
      }
    }
  };

  const doAdvanceUnit = (unitId: string) => {
    const store = useGameStore.getState();
    store.saveHistory();
    const roll = rollD6();
    const unit = store.units.find(u => u.id === unitId);
    
    store.setUnits(prev => prev.map(u => u.id === unitId ? { ...u, advanced: true, advanceRoll: roll } : u));
    store.setLog(prev => [createLog({ kind: "info", faction: store.game.activePlayer, round: store.game.round, text: `${unit?.name} avanzó +${roll}".` }), ...prev]);
  };

  const doFallBackUnit = (unitId: string) => {
    const store = useGameStore.getState();
    store.saveHistory();
    
    const unit = store.units.find(u => u.id === unitId);
    if (!unit) return;
    
    let casualtiesCount = 0;
    
    if (unit.isBattleShocked) {
      store.setTokens(prevTokens => prevTokens.map(token => {
        if (token.unitId === unitId && token.currentWounds > 0) {
          const isKilled = rollD6() <= CONSTANTS.MAX_FALLBACK_DEATH_ROLL;
          if (isKilled) {
            casualtiesCount++;
            return { ...token, currentWounds: 0 };
          }
        }
        return token;
      }));
    }
    
    const baseText = `${unit.name} se retiró.`;
    const text = casualtiesCount > 0 
      ? `${baseText} Al estar acobardada, sufrió ${casualtiesCount} bajas por Huida Desesperada.`
      : baseText;
    
    store.setUnits(prev => prev.map(u => u.id === unitId ? { ...u, fellBack: true } : u));
    store.setLog(prev => [
      createLog({ 
        kind: casualtiesCount > 0 ? "casualty" : "faction", 
        faction: store.game.activePlayer, 
        round: store.game.round, 
        text 
      }), 
      ...prev
    ]);
  };

  const doMicroMove = (unitId: string, type: "pile-in" | "consolidate") => {
    const store = useGameStore.getState();
    store.saveHistory();
    uiStore.setMicroMoveMode({ unitId, type });
    
    const unit = store.units.find(u => u.id === unitId);
    const label = type === "pile-in" ? "Apilar (Pile-in)" : "Reagrupar (Consolidar)";
    
    store.setLog(prev => [
      createLog({ kind: "info", faction: store.game.activePlayer, round: store.game.round, text: `Modo de micromovimiento activo para ${unit?.name}: ${label} hasta 3".` }), 
      ...prev
    ]);
  };

  const doEmbark = (unitId: string) => {
    const store = useGameStore.getState();
    store.saveHistory();
    
    const unit = store.units.find(u => u.id === unitId);
    if (!unit) return;
    
    const unitTokens = store.tokens.filter(t => t.unitId === unitId && t.currentWounds > 0);
    const validTransports = store.units.filter(tr => 
      tr.faction === unit.faction && tr.transportCapacity && tr.transportCapacity > 0
    );
    
    let targetTransport: Unit | undefined;
    
    for (const transport of validTransports) {
      const embarkedUnits = transport.embarkedUnits || [];
      let currentOccupancy = 0;
      for (const eId of embarkedUnits) {
        currentOccupancy += store.tokens.filter(t => t.unitId === eId && t.currentWounds > 0).length;
      }
      
      const spaceLeft = (transport.transportCapacity || 0) - currentOccupancy;
      
      if (unitTokens.length <= spaceLeft) {
        const transportToken = store.tokens.find(t => t.unitId === transport.id);
        if (!transportToken) continue;
        
        const allTokensInRange = unitTokens.every(t => getDistanceBetweenTokens(t, transportToken) <= CONSTANTS.EMBARK_RANGE);
        if (allTokensInRange) {
          targetTransport = transport;
          break;
        }
      }
    }

    if (targetTransport) {
      store.setUnits(prev => prev.map(u => 
        u.id === targetTransport!.id 
          ? { ...u, embarkedUnits: [...(u.embarkedUnits || []), unitId] } 
          : u
      ));
      store.setTokens(prev => prev.map(t => 
        t.unitId === unitId 
          ? { ...t, embarkedIn: targetTransport!.id, x: -100, y: -100 }
          : t
      ));
      store.setLog(prev => [
        createLog({ kind: "info", faction: store.game.activePlayer, round: store.game.round, text: `${unit.name} ha embarcado en ${targetTransport!.name}.` }), 
        ...prev
      ]);
    }
  };

  const doDisembark = (transportUnitId: string) => {
    const store = useGameStore.getState();
    store.saveHistory();
    
    const transport = store.units.find(u => u.id === transportUnitId);
    if (!transport || !transport.embarkedUnits?.length) return;
    
    const transportToken = store.tokens.find(t => t.unitId === transportUnitId);
    if (!transportToken) return;

    const embarkedId = transport.embarkedUnits[0];
    
    store.setUnits(prev => prev.map(u => 
      u.id === transportUnitId 
        ? { ...u, embarkedUnits: u.embarkedUnits!.filter(id => id !== embarkedId) } 
        : u
    ));
    
    let offset = 0;
    const tokensToDisembark = store.tokens.filter(token => token.unitId === embarkedId);
    const totalTokens = tokensToDisembark.length;
    const angleStep = (Math.PI * 2) / Math.max(1, totalTokens);

    store.setTokens(prev => prev.map(token => {
      if (token.unitId === embarkedId) {
        const angle = offset * angleStep;
        const newCoords = {
           x: transportToken.x + Math.cos(angle) * CONSTANTS.DISEMBARK_OFFSET,
           y: transportToken.y + Math.sin(angle) * CONSTANTS.DISEMBARK_OFFSET
        };
        offset++;
        return { ...token, embarkedIn: undefined, ...newCoords };
      }
      return token;
    }));
    
    store.setLog(prev => [
      createLog({ kind: "info", faction: store.game.activePlayer, round: store.game.round, text: `Una unidad ha desembarcado de ${transport.name}.` }), 
      ...prev
    ]);
  };

  return {
    resolveCharge,
    doAdvanceUnit,
    doFallBackUnit,
    doMicroMove,
    doEmbark,
    doDisembark
  };
}
