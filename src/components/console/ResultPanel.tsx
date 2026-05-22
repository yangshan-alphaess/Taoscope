import { useAppState } from "@/store/appState";
import { ResultTable } from "@/components/console/ResultTable";

export function ResultPanel() {
  const activeConsoleId = useAppState((s) => s.activeConsoleId);
  const result = useAppState((s) =>
    activeConsoleId ? (s.consoleRuntime[activeConsoleId]?.lastResult ?? null) : null,
  );

  return (
    <div className="flex-1 overflow-auto">
      {result ? (
        <ResultTable result={result} />
      ) : (
        <div className="flex h-full items-center justify-center">
          <p className="text-muted-foreground/60 text-xs">
            Run a query to see results.
          </p>
        </div>
      )}
    </div>
  );
}
