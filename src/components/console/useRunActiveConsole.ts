import type { HistoryEntry } from "@/datasource/types";
import { useDataSource } from "@/datasource/context";
import { useAppState } from "@/store/appState";
import * as editorBridge from "./editorBridge";
import { applyRowCap, injectRowCapLimit } from "./rowCapInjector";
import { findStatementAt } from "./splitStatements";

export interface UseRunActiveConsoleResult {
  canRun: boolean;
  isRunning: boolean;
  run: () => void;
}

const HISTORY_LIMIT = 50;

export function useRunActiveConsole(): UseRunActiveConsoleResult {
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

  function run() {
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

    const prevHistory = runtime?.history ?? [];
    const injected = injectRowCapLimit(chosenSql);
    setRunStarted(id);
    ds.runSql(connection.id, activeConsole.currentDb, injected)
      .then((r) => {
        const capped = applyRowCap(r);
        const entry: HistoryEntry = {
          sql: chosenSql,
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

  return { canRun, isRunning, run };
}
