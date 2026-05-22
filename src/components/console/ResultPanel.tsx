import type { ReactNode } from "react";

import type { QueryResult } from "@/datasource/types";
import { useAppState } from "@/store/appState";
import { ResultGrid } from "@/components/console/ResultGrid";

function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-muted-foreground/60 text-xs">{children}</p>
    </div>
  );
}

function FullScreenError({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center px-4">
      <p className="text-destructive text-xs">
        <span className="mr-1">✕</span>
        Query failed: <span className="font-mono">{message}</span>
      </p>
    </div>
  );
}

function GridWithBanners({
  result,
  error,
}: {
  result: QueryResult;
  error?: string | null;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {result.truncated && (
        <div className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 flex shrink-0 items-center gap-1.5 border-b px-3 py-1 text-xs">
          <span>⚠</span>
          <span>
            Result was capped at 1000 rows. Add a{" "}
            <code className="font-mono">LIMIT</code> clause to see specific
            data.
          </span>
        </div>
      )}
      {error && (
        <div className="border-destructive/30 bg-destructive/10 text-destructive flex shrink-0 items-center gap-1.5 border-b px-3 py-1 text-xs">
          <span>✕</span>
          <span>
            Last run failed: <span className="font-mono">{error}</span>
          </span>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <ResultGrid result={result} />
      </div>
    </div>
  );
}

export function ResultPanel() {
  const activeConsoleId = useAppState((s) => s.activeConsoleId);
  const runtime = useAppState((s) =>
    activeConsoleId ? s.consoleRuntime[activeConsoleId] : undefined,
  );

  let body: ReactNode;
  if (!activeConsoleId) {
    body = <EmptyHint>Open or create a console to start.</EmptyHint>;
  } else if (!runtime) {
    body = <EmptyHint>Loading…</EmptyHint>;
  } else {
    const { execStatus, execError, lastResult } = runtime;

    if (execStatus === "idle" && !lastResult) {
      body = <EmptyHint>Run a query to see results.</EmptyHint>;
    } else if (execStatus === "running" && !lastResult) {
      body = <EmptyHint>Running query…</EmptyHint>;
    } else if (execStatus === "running" && lastResult) {
      body = <GridWithBanners result={lastResult} />;
    } else if (
      execStatus === "ok" &&
      lastResult &&
      lastResult.rows.length === 0
    ) {
      body = <EmptyHint>Query succeeded with 0 rows.</EmptyHint>;
    } else if (execStatus === "ok" && lastResult) {
      body = <GridWithBanners result={lastResult} />;
    } else if (execStatus === "error" && lastResult) {
      body = <GridWithBanners result={lastResult} error={execError} />;
    } else if (execStatus === "error" && !lastResult) {
      body = <FullScreenError message={execError ?? "Unknown error"} />;
    } else {
      body = <EmptyHint>—</EmptyHint>;
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">{body}</div>
  );
}
