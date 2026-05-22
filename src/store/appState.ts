import { create } from "zustand";
import type { Connection, Console, QueryResult } from "@/datasource/types";

export type ExecStatus = "idle" | "running" | "ok" | "error";

export interface ConsoleRuntimeEntry {
  scratch: string;
  lastResult: QueryResult | null;
  execStatus: ExecStatus;
  execError: string | null;
}

const DEFAULT_RUNTIME: ConsoleRuntimeEntry = {
  scratch: "",
  lastResult: null,
  execStatus: "idle",
  execError: null,
};

interface AppState {
  // Connections (cached after first fetch; shared by Sidebar and TitleBar).
  connections: Connection[];
  setConnections: (connections: Connection[]) => void;

  // Current selection: which connection's schema is being browsed.
  currentConnectionId: string | null;
  setConnection: (id: string | null) => void;

  // Which database the SchemaPanel has expanded. Pure UI state — does NOT
  // drive SQL execution; only used so the "New Console" action can default
  // a new console's currentDb to whatever the user is currently browsing.
  schemaBrowsingDb: string | null;
  setSchemaBrowsingDb: (db: string | null) => void;

  // Console workspace.
  consoles: Console[];
  setConsoles: (list: Console[]) => void;
  addConsole: (c: Console) => void;
  removeConsole: (id: string) => void;
  renameConsoleLocal: (id: string, name: string) => void;
  setConsoleDbLocal: (id: string, db: string | null) => void;

  openConsoleIds: string[];
  activeConsoleId: string | null;
  openConsole: (id: string) => void;
  closeConsole: (id: string) => void;
  setActiveConsole: (id: string | null) => void;

  consoleRuntime: Record<string, ConsoleRuntimeEntry>;
  hydrateConsoleRuntime: (
    id: string,
    init: Partial<ConsoleRuntimeEntry>,
  ) => void;
  setScratch: (id: string, scratch: string) => void;
  setRunStarted: (id: string) => void;
  setRunOk: (id: string, result: QueryResult) => void;
  setRunError: (id: string, message: string) => void;
}

/** Pick a neighbor id in the openConsoleIds list when closing/deleting `id`. */
function pickNeighbor(list: string[], id: string): string | null {
  const idx = list.indexOf(id);
  if (idx === -1) return null;
  if (list.length === 1) return null;
  // Prefer the element after, else the element before.
  return list[idx + 1] ?? list[idx - 1] ?? null;
}

export const useAppState = create<AppState>((set) => ({
  connections: [],
  setConnections: (connections) => set({ connections }),

  currentConnectionId: null,
  setConnection: (id) =>
    set((state) =>
      id === state.currentConnectionId
        ? state
        : { currentConnectionId: id, schemaBrowsingDb: null },
    ),

  schemaBrowsingDb: null,
  setSchemaBrowsingDb: (db) => set({ schemaBrowsingDb: db }),

  consoles: [],
  setConsoles: (list) => set({ consoles: list }),
  addConsole: (c) =>
    set((state) => ({ consoles: [...state.consoles, c] })),
  removeConsole: (id) =>
    set((state) => {
      const consoles = state.consoles.filter((c) => c.id !== id);
      const openConsoleIds = state.openConsoleIds.filter((x) => x !== id);
      let activeConsoleId = state.activeConsoleId;
      if (activeConsoleId === id) {
        activeConsoleId = pickNeighbor(state.openConsoleIds, id);
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [id]: _dropped, ...consoleRuntime } = state.consoleRuntime;
      return { consoles, openConsoleIds, activeConsoleId, consoleRuntime };
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

  openConsoleIds: [],
  activeConsoleId: null,
  openConsole: (id) =>
    set((state) => {
      if (state.openConsoleIds.includes(id)) {
        return { activeConsoleId: id };
      }
      return {
        openConsoleIds: [...state.openConsoleIds, id],
        activeConsoleId: id,
      };
    }),
  closeConsole: (id) =>
    set((state) => {
      if (!state.openConsoleIds.includes(id)) return state;
      const openConsoleIds = state.openConsoleIds.filter((x) => x !== id);
      let activeConsoleId = state.activeConsoleId;
      if (activeConsoleId === id) {
        activeConsoleId = pickNeighbor(state.openConsoleIds, id);
      }
      return { openConsoleIds, activeConsoleId };
    }),
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
  setRunStarted: (id) =>
    set((state) => {
      const prev = state.consoleRuntime[id] ?? DEFAULT_RUNTIME;
      return {
        consoleRuntime: {
          ...state.consoleRuntime,
          [id]: { ...prev, execStatus: "running", execError: null },
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
          [id]: { ...prev, execStatus: "error", execError: message },
        },
      };
    }),
}));
