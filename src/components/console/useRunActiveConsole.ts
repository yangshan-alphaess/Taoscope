import { useDataSource } from "@/datasource/context";
import { useAppState } from "@/store/appState";

export interface UseRunActiveConsoleResult {
  canRun: boolean;
  isRunning: boolean;
  run: () => void;
}

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
    const scratch = runtime?.scratch ?? "";
    setRunStarted(id);
    ds.runSql(connection.id, activeConsole.currentDb, scratch)
      .then((r) => {
        setRunOk(id, r);
        void ds.saveResult(id, r);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setRunError(id, message);
      });
  }

  return { canRun, isRunning, run };
}
