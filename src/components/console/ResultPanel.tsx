import { useEffect, useState, type ReactNode } from "react";

import type { QueryResult } from "@/datasource/types";
import { useAppState } from "@/store/appState";
import { ResultExportBar } from "@/components/console/ResultExportBar";
import { ResultGrid } from "@/components/console/ResultGrid";

function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-muted-foreground/60 text-xs">{children}</p>
    </div>
  );
}

const TIMEOUT_ERROR_PREFIX = "Query timeout after ";

function parseTimeoutSeconds(message: string): number | null {
  if (!message.startsWith(TIMEOUT_ERROR_PREFIX)) return null;
  const m = /Query timeout after (\d+)ms/.exec(message);
  if (!m || !m[1]) return null;
  const ms = Number.parseInt(m[1], 10);
  return Number.isFinite(ms) ? Math.round(ms / 1000) : null;
}

function FullScreenError({ message }: { message: string }) {
  const timeoutSec = parseTimeoutSeconds(message);
  if (timeoutSec !== null) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <p className="text-amber-700 dark:text-amber-300 text-xs">
          <span className="mr-1">⏱</span>
          Query timed out after {timeoutSec}s. Adjust the timeout in
          connection settings.
        </p>
      </div>
    );
  }
  if (message.startsWith("Query cancelled")) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <p className="text-muted-foreground text-xs">Query was cancelled.</p>
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center px-4">
      <p className="text-destructive text-xs">
        <span className="mr-1">✕</span>
        Query failed: <span className="font-mono">{message}</span>
      </p>
    </div>
  );
}

function GridWithBanners({ result }: { result: QueryResult }) {
  const [filterQuery, setFilterQuery] = useState("");
  useEffect(() => {
    setFilterQuery("");
  }, [result]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <ResultExportBar
        result={result}
        filterQuery={filterQuery}
        onFilterChange={setFilterQuery}
      />
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
      <div className="min-h-0 flex-1">
        <ResultGrid result={result} filterQuery={filterQuery} />
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
    } else if (execStatus === "ok" && lastResult) {
      // Always render the grid on success — even with 0 rows, the column
      // headers tell the user what the query *would* have returned, which is
      // useful schema info. ResultGrid surfaces a "No rows" placeholder when
      // rows.length === 0.
      body = <GridWithBanners result={lastResult} />;
    } else if (execStatus === "error") {
      // Don't keep showing the previous query's grid behind a red banner —
      // that misleads the user into thinking the failed query "returned" those
      // columns. Show the error full-screen, regardless of whether a stale
      // lastResult is still around.
      body = <FullScreenError message={execError ?? "Unknown error"} />;
    } else {
      body = <EmptyHint>—</EmptyHint>;
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">{body}</div>
  );
}
