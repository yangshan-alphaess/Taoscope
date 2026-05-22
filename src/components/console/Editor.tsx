import { useEffect, useRef } from "react";
import { useDataSource } from "@/datasource/context";
import { useAppState } from "@/store/appState";

const SCRATCH_DEBOUNCE_MS = 400;

export function Editor() {
  const ds = useDataSource();
  const activeConsoleId = useAppState((s) => s.activeConsoleId);
  const runtime = useAppState((s) =>
    activeConsoleId ? s.consoleRuntime[activeConsoleId] : undefined,
  );
  const hydrateConsoleRuntime = useAppState((s) => s.hydrateConsoleRuntime);
  const setScratch = useAppState((s) => s.setScratch);

  // Track which console ids have been hydration-started this session to
  // avoid double-fetching during re-renders.
  const hydratingRef = useRef<Set<string>>(new Set());

  // Hydrate runtime on first activation of a console.
  useEffect(() => {
    if (!activeConsoleId) return;
    if (runtime) return;
    if (hydratingRef.current.has(activeConsoleId)) return;
    hydratingRef.current.add(activeConsoleId);
    let cancelled = false;
    Promise.all([
      ds.loadScratch(activeConsoleId),
      ds.loadResult(activeConsoleId),
    ]).then(([scratch, lastResult]) => {
      if (cancelled) return;
      hydrateConsoleRuntime(activeConsoleId, {
        scratch,
        lastResult,
        execStatus: "idle",
        execError: null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [ds, activeConsoleId, runtime, hydrateConsoleRuntime]);

  // Debounced scratch persistence.
  useEffect(() => {
    if (!activeConsoleId) return;
    if (!runtime) return;
    const id = activeConsoleId;
    const value = runtime.scratch;
    const handle = window.setTimeout(() => {
      void ds.saveScratch(id, value);
    }, SCRATCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [ds, activeConsoleId, runtime]);

  if (!activeConsoleId) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-3">
        <p className="text-muted-foreground/60 text-xs">
          Open or create a console to start writing SQL.
        </p>
      </div>
    );
  }

  if (!runtime) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-3">
        <p className="text-muted-foreground/60 text-xs">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 p-2">
      <textarea
        value={runtime.scratch}
        onChange={(e) => setScratch(activeConsoleId, e.target.value)}
        placeholder="-- write your SQL here"
        spellCheck={false}
        className="border-border bg-card text-foreground placeholder:text-muted-foreground/60 focus:ring-primary/40 h-full w-full resize-none rounded-md border p-2 font-mono text-xs outline-none focus:ring-2"
      />
    </div>
  );
}
