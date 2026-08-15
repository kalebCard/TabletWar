import { create, StateCreator } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FactionId, GameState, LogEntry, Token, Unit, RosterUnit, QueuedAttack, Terrain } from "../game/types";
import { makeInitialTerrain } from "../game/constants";
import { EventBus } from "../game/EventBus";

// ---------------------------------------------------------
// 1. Game Slice (Dominio puro)
// ---------------------------------------------------------
export interface GameSlice {
  tokens: Token[];
  units: Unit[];
  rosterUnits: RosterUnit[];
  terrainState: Terrain[];
  game: GameState;
  log: LogEntry[];

  setTokens: (tokens: Token[] | ((prev: Token[]) => Token[])) => void;
  setUnits: (units: Unit[] | ((prev: Unit[]) => Unit[])) => void;
  setRosterUnits: (rosterUnits: RosterUnit[] | ((prev: RosterUnit[]) => RosterUnit[])) => void;
  setTerrainState: (terrainState: Terrain[] | ((prev: Terrain[]) => Terrain[])) => void;
  setLog: (log: LogEntry[] | ((prev: LogEntry[]) => LogEntry[])) => void;
  setGame: (game: GameState | ((prev: GameState) => GameState)) => void;

  moveTokens: (moves: { id: string; x: number; y: number; z?: number }[]) => void;
  moveTerrain: (moves: { id: string; dx: number; dy: number }[]) => void;
  wound: (id: string, d: number) => void;
  adjustVp: (f: FactionId, d: number) => void;
  adjustCp: (f: FactionId, d: number) => void;
}

const createGameSlice: StateCreator<GameStore, [], [], GameSlice> = (set, get) => ({
  tokens: [],
  units: [],
  rosterUnits: [],
  log: [],
  game: {
    terrainLayout: "custom",
    round: 1,
    activePlayer: "imperium",
    phase: "roster",
    vp: { imperium: 0, chaos: 0 },
    cp: { imperium: 1, chaos: 1 },
    pointsLimit: 500
  },
  terrainState: makeInitialTerrain("custom"),

  setTokens: (updater) => set((state) => ({ tokens: typeof updater === 'function' ? updater(state.tokens) : updater })),
  setUnits: (updater) => set((state) => ({ units: typeof updater === 'function' ? updater(state.units) : updater })),
  setRosterUnits: (updater) => set((state) => ({ rosterUnits: typeof updater === 'function' ? updater(state.rosterUnits) : updater })),
  setTerrainState: (updater) => set((state) => ({ terrainState: typeof updater === 'function' ? updater(state.terrainState) : updater })),
  setLog: (updater) => set((state) => ({ log: typeof updater === 'function' ? updater(state.log) : updater })),
  setGame: (updater) => set((state) => ({ game: typeof updater === 'function' ? updater(state.game) : updater })),

  moveTokens: (moves) => {
    get().saveHistory();
    set((state) => {
      const nextTokens = state.tokens.map((t) => {
        const move = moves.find((m) => m.id === t.id);
        if (move) {
          return { ...t, x: move.x, y: move.y, z: move.z ?? t.z, moved: true };
        }
        return t;
      });

      const nextUnits = state.units.map((u) => {
        const unitTokens = nextTokens.filter((t) => t.unitId === u.id);
        const allMoved = unitTokens.length > 0 && unitTokens.every((t) => t.moved);
        return { ...u, hasMoved: allMoved };
      });

      return { tokens: nextTokens, units: nextUnits };
    });
  },

  moveTerrain: (moves) => {
    get().saveHistory();
    set((state) => ({
      terrainState: state.terrainState.map(t => {
        const move = moves.find(m => m.id === t.id);
        if (move) {
          return {
            ...t,
            points: t.points.map(p => ({ x: p.x + move.dx, y: p.y + move.dy })),
            platforms: t.platforms?.map(plat => ({
              ...plat,
              points: plat.points?.map(p => ({ x: p.x + move.dx, y: p.y + move.dy }))
            }))
          };
        }
        return t;
      })
    }));
  },

  wound: (id, d) => {
    get().saveHistory();
    set((state) => ({
      tokens: state.tokens.map((t) =>
        t.id === id ? { ...t, currentWounds: Math.max(0, Math.min(t.stats.wounds, t.currentWounds + d)) } : t
      )
    }));
  },

  adjustVp: (f, d) => {
    get().saveHistory();
    set((state) => ({
      game: { ...state.game, vp: { ...state.game.vp, [f]: Math.max(0, state.game.vp[f] + d) } }
    }));
  },

  adjustCp: (f, d) => {
    get().saveHistory();
    set((state) => ({
      game: { ...state.game, cp: { ...state.game.cp, [f]: Math.max(0, state.game.cp[f] + d) } }
    }));
  }
});

// ---------------------------------------------------------
// 2. History Slice (Undo/Redo sobre el GameSlice)
// ---------------------------------------------------------
export type GameSnapshot = Pick<GameSlice, "tokens" | "units" | "rosterUnits" | "terrainState" | "game" | "log">;

export interface HistorySlice {
  isLoaded: boolean;
  history: GameSnapshot[];
  historyIndex: number;

  setIsLoaded: (isLoaded: boolean) => void;
  saveHistory: () => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
}

const createHistorySlice: StateCreator<GameStore, [], [], HistorySlice> = (set, get) => ({
  isLoaded: false,
  history: [],
  historyIndex: -1,

  setIsLoaded: (isLoaded) => set({ isLoaded }),

  saveHistory: () => set((state) => {
    let newHistory = state.history;
    let newIndex = state.historyIndex;
    if (state.historyIndex < state.history.length - 1) {
      newHistory = state.history.slice(0, state.historyIndex + 1);
    }
    const snapshot: GameSnapshot = structuredClone({
      tokens: state.tokens,
      units: state.units,
      rosterUnits: state.rosterUnits,
      terrainState: state.terrainState,
      game: state.game,
      log: state.log,
    });
    newHistory = [...newHistory, snapshot];
    if (newHistory.length > 50) {
      newHistory.shift();
    } else {
      newIndex++;
    }
    return { history: newHistory, historyIndex: newIndex };
  }),

  undo: () => set((state) => {
    if (state.historyIndex >= 0) {
      let newHistory = state.history;
      let newIndex = state.historyIndex;
      if (state.historyIndex === state.history.length - 1) {
        get().saveHistory();
        newIndex = get().historyIndex - 1;
        newHistory = get().history;
      }
      const snapshot = newHistory[newIndex];
      newIndex--;
      if (newIndex < -1) newIndex = -1;
      return {
        ...snapshot,
        history: newHistory,
        historyIndex: newIndex
      };
    }
    return {};
  }),

  redo: () => set((state) => {
    if (state.historyIndex < state.history.length - 2) {
      const newIndex = state.historyIndex + 1;
      const snapshot = state.history[newIndex + 1];
      return {
        ...snapshot,
        historyIndex: newIndex
      };
    }
    return {};
  }),

  reset: () => {
    localStorage.removeItem('wh4k_save');
    set({
      tokens: [],
      units: [],
      rosterUnits: [],
      terrainState: makeInitialTerrain("custom"),
      log: [],
      history: [],
      historyIndex: -1,
      game: {
        terrainLayout: "custom",
        round: 1,
        activePlayer: "imperium",
        phase: "roster",
        vp: { imperium: 0, chaos: 0 },
        cp: { imperium: 1, chaos: 1 },
        pointsLimit: 500
      },
    });
  }
});

// ---------------------------------------------------------
// Exportación Unificada
// ---------------------------------------------------------
export type GameStore = GameSlice & HistorySlice;

export const useGameStore = create<GameStore>()(
  persist(
    (...a) => ({
      ...createGameSlice(...a),
      ...createHistorySlice(...a),
    }),
    {
      name: 'wh4k_save',
      partialize: (state) => ({
        tokens: state.tokens,
        units: state.units,
        rosterUnits: state.rosterUnits,
        terrainState: state.terrainState,
        game: state.game,
        log: state.log.slice(0, 50),
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setIsLoaded(true);
        }
      },
    }
  )
);
