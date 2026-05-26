import type { HistoryEntry } from "@/datasource/types";
import { useDataSource } from "@/datasource/context";
import { useAppState } from "@/store/appState";
import * as editorBridge from "./editorBridge";
import {
  applyRowCap,
  ensureExplainPrefix,
  injectRowCapLimit,
} from "./rowCapInjector";
import { findStatementAt } from "./splitStatements";

export type ExecMode = "run" | "explain";

export interface UseExecActiveConsoleResult {
  canRun: boolean;
  isRunning: boolean;
  exec: () => void;
  cancel: () => void;
}

const HISTORY_LIMIT = 50;

export function useExecActiveConsole(
  mode: ExecMode,
): UseExecActiveConsoleResult {
  const ds = useDataSource();
  const activeConsoleId = useAppState((s) => s.activeConsoleId);
  const activeConsole = useAppState((s) =>
    activeConsoleId
      ? (s.consoles.find((c) => c.id === activeConsoleId) ?? null)
      : null,
  );
  const connection = useAppState((s) =>
    activeConsole
      ? (s.connections.find((c) => c.id === activeConsole.connectionId) ?? null)
      : null,
  );
  const runtime = useAppState((s) =>
    activeConsoleId ? s.consoleRuntime[activeConsoleId] : undefined,
  );
  const setRunStarted = useAppState((s) => s.setRunStarted);
  const setRunOk = useAppState((s) => s.setRunOk);
  const setRunError = useAppState((s) => s.setRunError);
  const setHistory = useAppState((s) => s.setHistory);

  const canRun =
    !!activeConsoleId &&
    !!activeConsole &&
    !!connection &&
    connection.status === "online" &&
    runtime?.execStatus !== "running";

  const isRunning = runtime?.execStatus === "running";

  function exec() {
    if (!canRun || !activeConsole || !connection || !activeConsoleId) return;
    const id = activeConsoleId;
    const fullScratch = runtime?.scratch ?? "";

    // Three-tier SQL resolution: selection → statement-at-cursor → full scratch.
    let chosenSql: string;
    const sel = editorBridge.getSelectionRange();
    if (sel) {
      chosenSql = editorBridge.getSelectionText();
    } else {
      const pos = editorBridge.getCursorPos();
      if (pos !== null) {
        const stmt = findStatementAt(fullScratch, pos);
        chosenSql = stmt?.text ?? fullScratch;
      } else {
        chosenSql = fullScratch;
      }
    }

    if (chosenSql.trim().length === 0) return;

    // For explain mode, prepend EXPLAIN if absent. History stores the
    // dispatched SQL (with prefix) so replaying from history reproduces the
    // plan-query semantics.
    const dispatchSql =
      mode === "explain" ? ensureExplainPrefix(chosenSql) : chosenSql;

    const prevHistory = runtime?.history ?? [];
    const injected = injectRowCapLimit(dispatchSql);
    const queryId = crypto.randomUUID();
    setRunStarted(id, queryId);
    ds.runSql(connection.id, activeConsole.currentDb, injected, queryId)
      .then((r) => {
        const capped = applyRowCap(r);
        const entry: HistoryEntry = {
          sql: dispatchSql,
          runAt: Date.now(),
          rowCount: capped.rowCount,
          elapsedMs: capped.elapsedMs,
          truncated: capped.truncated,
        };
        const next = [entry, ...prevHistory].slice(0, HISTORY_LIMIT);
        setHistory(id, next);
        setRunOk(id, capped);
        void ds.saveResult(id, capped);
        void ds.saveHistory(id, next);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setRunError(id, message);
      });
  }

  function cancel() {
    const queryId = runtime?.runningQueryId;
    if (!queryId) return;
    // Fire and forget: the UI reverts to idle as soon as the in-flight
    // promise rejects (via setRunError on "Query cancelled").
    void ds.cancelQuery(queryId);
  }

  return { canRun, isRunning, exec, cancel };
}
