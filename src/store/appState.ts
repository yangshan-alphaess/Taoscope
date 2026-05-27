import { create } from "zustand";
import type {
  Connection,
  Console,
  HistoryEntry,
  QueryResult,
} from "@/datasource/types";

export type ExecStatus = "idle" | "running" | "ok" | "error";

export interface GridState {
  sorting: { id: string; desc: boolean }[];
  columnSizing: Record<string, number>;
}

const DEFAULT_GRID_STATE: GridState = {
  sorting: [],
  columnSizing: {},
};

export interface ConsoleRuntimeEntry {
  scratch: string;
  lastResult: QueryResult | null;
  execStatus: ExecStatus;
  execError: string | null;
  gridState: GridState;
  history: HistoryEntry[];
  /** UUID of the currently in-flight runSql; null when idle. */
  runningQueryId: string | null;
}

const DEFAULT_RUNTIME: ConsoleRuntimeEntry = {
  scratch: "",
  lastResult: null,
  execStatus: "idle",
  execError: null,
  gridState: DEFAULT_GRID_STATE,
  history: [],
  runningQueryId: null,
};

interface AppState {
  connections: Connection[];
  setConnections: (connections: Connection[]) => void;

  consoles: Console[];
  setConsoles: (list: Console[]) => void;
  addConsole: (c: Console) => void;
  removeConsole: (id: string) => void;
  removeConsolesByConnection: (connectionId: string) => void;
  renameConsoleLocal: (id: string, name: string) => void;
  setConsoleDbLocal: (id: string, db: string | null) => void;

  activeConsoleId: string | null;
  setActiveConsole: (id: string | null) => void;

  consoleRuntime: Record<string, ConsoleRuntimeEntry>;
  hydrateConsoleRuntime: (
    id: string,
    init: Partial<ConsoleRuntimeEntry>,
  ) => void;
  setScratch: (id: string, scratch: string) => void;
  setRunStarted: (id: string, queryId: string) => void;
  setRunOk: (id: string, result: QueryResult) => void;
  setRunError: (id: string, message: string) => void;
  setGridState: (id: string, state: GridState) => void;
  setHistory: (id: string, entries: HistoryEntry[]) => void;
}

export const useAppState = create<AppState>((set) => ({
  connections: [],
  setConnections: (connections) => set({ connections }),

  consoles: [],
  setConsoles: (list) => set({ consoles: list }),
  addConsole: (c) =>
    set((state) => ({ consoles: [...state.consoles, c] })),
  removeConsole: (id) =>
    set((state) => {
      const consoles = state.consoles.filter((c) => c.id !== id);
      const activeConsoleId =
        state.activeConsoleId === id ? null : state.activeConsoleId;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [id]: _dropped, ...consoleRuntime } = state.consoleRuntime;
      return { consoles, activeConsoleId, consoleRuntime };
    }),
  removeConsolesByConnection: (connectionId) =>
    set((state) => {
      const dropped = new Set(
        state.consoles
          .filter((c) => c.connectionId === connectionId)
          .map((c) => c.id),
      );
      if (dropped.size === 0) return state;
      const consoles = state.consoles.filter((c) => !dropped.has(c.id));
      const activeConsoleId =
        state.activeConsoleId && dropped.has(state.activeConsoleId)
          ? null
          : state.activeConsoleId;
      const consoleRuntime = Object.fromEntries(
        Object.entries(state.consoleRuntime).filter(
          ([cid]) => !dropped.has(cid),
        ),
      );
      return { consoles, activeConsoleId, consoleRuntime };
    }),
  renameConsoleLocal: (id, name) =>
    set((state) => ({
      consoles: state.consoles.map((c) =>
        c.id === id ? { ...c, name } : c,
      ),
    })),
  setConsoleDbLocal: (id, db) =>
    set((state) => ({
      consoles: state.consoles.map((c) =>
        c.id === id ? { ...c, currentDb: db } : c,
      ),
    })),

  activeConsoleId: null,
  setActiveConsole: (id) => set({ activeConsoleId: id }),

  consoleRuntime: {},
  hydrateConsoleRuntime: (id, init) =>
    set((state) => {
      if (state.consoleRuntime[id]) return state;
      return {
        consoleRuntime: {
          ...state.consoleRuntime,
          [id]: { ...DEFAULT_RUNTIME, ...init },
        },
      };
    }),
  setScratch: (id, scratch) =>
    set((state) => {
      const prev = state.consoleRuntime[id] ?? DEFAULT_RUNTIME;
      return {
        consoleRuntime: {
          ...state.consoleRuntime,
          [id]: { ...prev, scratch },
        },
      };
    }),
  setRunStarted: (id, queryId) =>
    set((state) => {
      const prev = state.consoleRuntime[id] ?? DEFAULT_RUNTIME;
      return {
        consoleRuntime: {
          ...state.consoleRuntime,
          [id]: {
            ...prev,
            execStatus: "running",
            execError: null,
            runningQueryId: queryId,
          },
        },
      };
    }),
  setRunOk: (id, result) =>
    set((state) => {
      const prev = state.consoleRuntime[id] ?? DEFAULT_RUNTIME;
      return {
        consoleRuntime: {
          ...state.consoleRuntime,
          [id]: {
            ...prev,
            execStatus: "ok",
            execError: null,
            lastResult: result,
            gridState: DEFAULT_GRID_STATE,
            runningQueryId: null,
          },
        },
      };
    }),
  setRunError: (id, message) =>
    set((state) => {
      const prev = state.consoleRuntime[id] ?? DEFAULT_RUNTIME;
      return {
        consoleRuntime: {
          ...state.consoleRuntime,
          [id]: {
            ...prev,
            execStatus: "error",
            execError: message,
            runningQueryId: null,
          },
        },
      };
    }),
  setGridState: (id, gridState) =>
    set((state) => {
      const prev = state.consoleRuntime[id];
      if (!prev) return state;
      return {
        consoleRuntime: {
          ...state.consoleRuntime,
          [id]: { ...prev, gridState },
        },
      };
    }),
  setHistory: (id, entries) =>
    set((state) => {
      const prev = state.consoleRuntime[id];
      if (!prev) return state;
      return {
        consoleRuntime: {
          ...state.consoleRuntime,
          [id]: { ...prev, history: entries },
        },
      };
    }),
}));
