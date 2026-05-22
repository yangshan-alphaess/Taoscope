import { create } from "zustand";
import type { Connection, QueryResult } from "@/datasource/types";

export type ExecStatus = "ready" | "running" | "ok" | "error";

interface AppState {
  // Connections (cached after first fetch; shared by Sidebar and TitleBar).
  connections: Connection[];
  setConnections: (connections: Connection[]) => void;

  // Current selection.
  currentConnectionId: string | null;
  currentDatabase: string | null;
  setConnection: (id: string | null) => void;
  setDatabase: (name: string | null) => void;

  // Execution status & last result (driven by MainArea, read by StatusBar).
  execStatus: ExecStatus;
  execError: string | null;
  lastResult: QueryResult | null;
  setExecRunning: () => void;
  setExecOk: (result: QueryResult) => void;
  setExecError: (message: string) => void;
}

export const useAppState = create<AppState>((set) => ({
  connections: [],
  setConnections: (connections) => set({ connections }),

  currentConnectionId: null,
  currentDatabase: null,
  setConnection: (id) =>
    set((state) =>
      id === state.currentConnectionId
        ? state
        : { currentConnectionId: id, currentDatabase: null },
    ),
  setDatabase: (name) => set({ currentDatabase: name }),

  execStatus: "ready",
  execError: null,
  lastResult: null,
  setExecRunning: () =>
    set({ execStatus: "running", execError: null }),
  setExecOk: (result) =>
    set({ execStatus: "ok", execError: null, lastResult: result }),
  setExecError: (message) =>
    set({ execStatus: "error", execError: message }),
}));
