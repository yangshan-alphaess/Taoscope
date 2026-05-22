import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { useDataSource } from "@/datasource/context";
import { useAppState } from "@/store/appState";
import type { Column, QueryResult } from "@/datasource/types";
import { cn } from "@/lib/utils";

const CONSOLE_ID = "default";
const SCRATCH_DEBOUNCE_MS = 400;

function formatCell(value: unknown, col: Column): string {
  if (value === null || value === undefined) return "NULL";
  if (col.type === "TIMESTAMP" && typeof value === "number") {
    return new Date(value).toISOString();
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function MainArea() {
  const ds = useDataSource();
  const currentConnectionId = useAppState((s) => s.currentConnectionId);
  const currentDatabase = useAppState((s) => s.currentDatabase);
  const execStatus = useAppState((s) => s.execStatus);
  const setExecRunning = useAppState((s) => s.setExecRunning);
  const setExecOk = useAppState((s) => s.setExecOk);
  const setExecError = useAppState((s) => s.setExecError);

  const [sql, setSql] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const scratchHydratedRef = useRef(false);

  // Restore scratch on mount.
  useEffect(() => {
    let cancelled = false;
    ds.loadScratch(CONSOLE_ID).then((content) => {
      if (cancelled) return;
      setSql(content);
      scratchHydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [ds]);

  // Debounced persistence.
  useEffect(() => {
    if (!scratchHydratedRef.current) return;
    const handle = window.setTimeout(() => {
      void ds.saveScratch(CONSOLE_ID, sql);
    }, SCRATCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [ds, sql]);

  const canRun =
    Boolean(currentConnectionId) &&
    Boolean(currentDatabase) &&
    execStatus !== "running";

  async function handleRun() {
    if (!currentConnectionId || !currentDatabase) return;
    setExecRunning();
    try {
      const r = await ds.runSql(currentConnectionId, currentDatabase, sql);
      setResult(r);
      setExecOk(r);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setExecError(message);
    }
  }

  return (
    <main className="bg-background flex flex-1 flex-col overflow-hidden">
      {/* TabBar */}
      <div className="border-border flex h-9 shrink-0 items-end border-b">
        <div className="border-border bg-card flex h-full items-center gap-2 border-r px-3 text-xs">
          <span className="bg-primary h-2 w-2 rounded-full" aria-hidden />
          <span>Console #1</span>
        </div>
      </div>

      {/* Editor */}
      <div className="border-border flex shrink-0 flex-col border-b">
        <div className="flex items-start gap-2 p-2">
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            placeholder="-- write your SQL here"
            spellCheck={false}
            className="border-border bg-card text-foreground placeholder:text-muted-foreground/60 focus:ring-primary/40 h-32 flex-1 resize-y rounded-md border p-2 font-mono text-xs outline-none focus:ring-2"
          />
          <div className="flex flex-col items-stretch gap-1">
            <button
              type="button"
              onClick={handleRun}
              disabled={!canRun}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                canRun
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              <Play className="h-3.5 w-3.5" />
              {execStatus === "running" ? "Running…" : "Run"}
            </button>
            {(!currentConnectionId || !currentDatabase) && (
              <span className="text-muted-foreground text-[10px] leading-tight">
                Select a database first
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Result */}
      <div className="flex-1 overflow-auto">
        {result ? (
          <table className="w-full border-collapse font-mono text-xs">
            <thead className="bg-card border-border sticky top-0 border-b">
              <tr>
                {result.columns.map((c) => (
                  <th
                    key={c.name}
                    className="border-border border-r px-3 py-1.5 text-left font-medium whitespace-nowrap last:border-r-0"
                  >
                    <span>{c.name}</span>
                    <span className="text-muted-foreground/70 ml-1">
                      {c.type}
                      {c.isTag ? " · tag" : ""}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-border hover:bg-muted/30 border-b"
                >
                  {row.map((cell, j) => {
                    const col = result.columns[j];
                    return (
                      <td
                        key={j}
                        className="border-border border-r px-3 py-1 whitespace-nowrap last:border-r-0"
                      >
                        {col ? formatCell(cell, col) : String(cell ?? "")}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground/60 text-xs">
              Run a query to see results.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
