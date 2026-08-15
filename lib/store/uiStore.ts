import { create } from 'zustand';
import { EventBus } from "../game/EventBus";
import type { QueuedAttack } from "../game/types";

export interface UISlice {
  selectedIds: string[];
  combatTargetId: string | null;
  combatQueue: QueuedAttack[];
  deployingUnitId: string | null;
  microMoveMode: { unitId: string, type: "pile-in" | "consolidate" } | null;
  
  // Estados de layout
  isMobileOpen: boolean;
  isStratagemsOpen: boolean;
  isPhaseModalOpen: boolean;
  isMobileFloatingUnitOpen: boolean;
  isMobileFloatingCombatOpen: boolean;

  setSelectedIds: (selectedIds: string[] | ((prev: string[]) => string[])) => void;
  setCombatTargetId: (combatTargetId: string | null | ((prev: string | null) => string | null)) => void;
  setCombatQueue: (combatQueue: QueuedAttack[] | ((prev: QueuedAttack[]) => QueuedAttack[])) => void;
  setDeployingUnitId: (deployingUnitId: string | null | ((prev: string | null) => string | null)) => void;
  setMicroMoveMode: (microMoveMode: { unitId: string, type: "pile-in" | "consolidate" } | null | ((prev: { unitId: string, type: "pile-in" | "consolidate" } | null) => { unitId: string, type: "pile-in" | "consolidate" } | null)) => void;
  
  setUIState: (state: Partial<UISlice>) => void;
  triggerVisualEvent: (eventName: string, payload?: any) => void;
}

export const useUIStore = create<UISlice>((set) => ({
  selectedIds: [],
  combatTargetId: null,
  combatQueue: [],
  deployingUnitId: null,
  microMoveMode: null,

  isMobileOpen: false,
  isStratagemsOpen: false,
  isPhaseModalOpen: false,
  isMobileFloatingUnitOpen: false,
  isMobileFloatingCombatOpen: false,

  setSelectedIds: (updater) => set((state) => {
    const next = typeof updater === 'function' ? updater(state.selectedIds) : updater;
    return { selectedIds: next, isMobileFloatingUnitOpen: false };
  }),
  setCombatTargetId: (updater) => set((state) => ({ combatTargetId: typeof updater === 'function' ? updater(state.combatTargetId) : updater })),
  setCombatQueue: (updater) => set((state) => ({ combatQueue: typeof updater === 'function' ? updater(state.combatQueue) : updater })),
  setDeployingUnitId: (updater) => set((state) => ({ deployingUnitId: typeof updater === 'function' ? updater(state.deployingUnitId) : updater })),
  setMicroMoveMode: (updater) => set((state) => ({ microMoveMode: typeof updater === 'function' ? updater(state.microMoveMode) : updater })),

  setUIState: (newState) => set((state) => ({ ...newState })),

  triggerVisualEvent: (eventName, payload) => {
    EventBus.emit(eventName as any, payload);
  }
}));
