import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { QueryResult } from "@/datasource/types";
import { useAppState } from "@/store/appState";
import { ResultExportBar } from "@/components/console/ResultExportBar";
import { ResultGrid } from "@/components/console/ResultGrid";
import { ResultStatsPill } from "@/components/layout/StatusBar";

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
  const { t } = useTranslation("result");
  const timeoutSec = parseTimeoutSeconds(message);
  if (timeoutSec !== null) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <p className="text-amber-700 dark:text-amber-300 text-xs">
          <span className="mr-1">⏱</span>
          {t("error.timeout", { seconds: timeoutSec })}
        </p>
      </div>
    );
  }
  if (message.startsWith("Query cancelled")) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <p className="text-muted-foreground text-xs">{t("error.cancelled")}</p>
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center px-4">
      <p className="text-destructive text-xs">
        <span className="mr-1">✕</span>
        {t("error.failed-prefix")}{" "}
        <span className="font-mono">{message}</span>
      </p>
    </div>
  );
}

function AffectedRowsBanner({ result }: { result: QueryResult }) {
  const { t } = useTranslation("result");
  const affected = result.affectedRows ?? 0;
  const text =
    affected > 0
      ? t("affected.rows", {
          count: affected,
          ms: result.elapsedMs,
        })
      : t("affected.success", { ms: result.elapsedMs });
  return (
    <div className="flex h-full items-center justify-center px-4">
      <p className="text-emerald-600 dark:text-emerald-400 text-xs">
        <span className="mr-1">✓</span>
        {text}
      </p>
    </div>
  );
}

function GridWithBanners({ result }: { result: QueryResult }) {
  const { t } = useTranslation("result");
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
            {t("banner.truncated", { cap: 1000, limit: "LIMIT" })}
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
  const { t } = useTranslation("result");
  const activeConsoleId = useAppState((s) => s.activeConsoleId);
  const runtime = useAppState((s) =>
    activeConsoleId ? s.consoleRuntime[activeConsoleId] : undefined,
  );

  let body: ReactNode;
  if (!activeConsoleId) {
    body = <EmptyHint>{t("empty.no-console")}</EmptyHint>;
  } else if (!runtime) {
    body = <EmptyHint>{t("empty.loading")}</EmptyHint>;
  } else {
    const { execStatus, execError, lastResult } = runtime;

    if (execStatus === "idle" && !lastResult) {
      body = <EmptyHint>{t("empty.run-prompt")}</EmptyHint>;
    } else if (execStatus === "running" && !lastResult) {
      body = <EmptyHint>{t("empty.running")}</EmptyHint>;
    } else if (execStatus === "running" && lastResult) {
      body = <GridWithBanners result={lastResult} />;
    } else if (execStatus === "ok" && lastResult?.affectedRows != null) {
      // Write/DDL statement: no result set, show an affected-rows banner.
      body = <AffectedRowsBanner result={lastResult} />;
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
      body = <FullScreenError message={execError ?? t("error.unknown")} />;
    } else {
      body = <EmptyHint>—</EmptyHint>;
    }
  }

  return (
    <div className="border-border/70 bg-card relative flex h-full min-h-0 flex-col overflow-hidden rounded-lg border shadow-[0_4px_16px_-4px_rgba(0,0,0,0.45),inset_0_1px_0_0_hsl(0_0%_100%/0.05)]">
      {body}
      <ResultStatsPill />
    </div>
  );
}
