import { forwardRef, useState, type ComponentPropsWithoutRef } from "react";
import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import type { HistoryEntry } from "@/datasource/types";
import { useDataSource } from "@/datasource/context";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAppState } from "@/store/appState";

const EMPTY_HISTORY: HistoryEntry[] = [];

interface ToolbarTriggerProps extends ComponentPropsWithoutRef<"button"> {
  disabled?: boolean;
  label: string;
  title: string;
}

const HistoryTrigger = forwardRef<HTMLButtonElement, ToolbarTriggerProps>(
  function HistoryTrigger(
    { disabled, className, label, title, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        title={title}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
          disabled
            ? "text-muted-foreground/60 cursor-not-allowed"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
          className,
        )}
        {...rest}
      >
        <Clock className="h-3.5 w-3.5" />
        <span>{label}</span>
      </button>
    );
  },
);

function relativeTime(epoch: number, t: TFunction): string {
  const diffMs = Date.now() - epoch;
  if (diffMs < 0) return t("history.rel.just-now");
  const sec = Math.floor(diffMs / 1000);
  if (sec < 30) return t("history.rel.just-now");
  if (sec < 60) return t("history.rel.seconds-ago", { n: sec });
  const min = Math.floor(sec / 60);
  if (min < 60) return t("history.rel.minutes-ago", { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("history.rel.hours-ago", { n: hr });
  const day = Math.floor(hr / 24);
  return t("history.rel.days-ago", { n: day });
}

export function QueryHistoryButton() {
  const { t } = useTranslation("console");
  const { t: tCommon } = useTranslation("common");
  const ds = useDataSource();
  const activeConsoleId = useAppState((s) => s.activeConsoleId);
  const history = useAppState((s) => {
    if (!activeConsoleId) return EMPTY_HISTORY;
    return s.consoleRuntime[activeConsoleId]?.history ?? EMPTY_HISTORY;
  });
  const setScratch = useAppState((s) => s.setScratch);
  const setHistory = useAppState((s) => s.setHistory);

  const [open, setOpen] = useState(false);

  function pickEntry(sql: string) {
    if (!activeConsoleId) return;
    setScratch(activeConsoleId, sql);
    setOpen(false);
  }

  function clearAll() {
    if (!activeConsoleId) return;
    setHistory(activeConsoleId, []);
    void ds.saveHistory(activeConsoleId, []);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <HistoryTrigger
          disabled={!activeConsoleId}
          label={t("toolbar.history.label")}
          title={t("toolbar.history.title")}
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-96 p-0"
      >
        <div className="border-border border-b px-3 py-1.5 text-xs font-medium">
          {t("history.popover-title", { count: history.length })}
        </div>
        {history.length === 0 ? (
          <p className="text-muted-foreground/70 px-3 py-3 text-xs italic">
            {t("history.empty")}
          </p>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {history.map((entry, i) => {
              const preview =
                entry.sql.length > 80
                  ? `${entry.sql.slice(0, 80)}…`
                  : entry.sql;
              return (
                <li key={i} className="border-border/40 border-b last:border-b-0">
                  <button
                    type="button"
                    onClick={() => pickEntry(entry.sql)}
                    className="hover:bg-muted/50 flex w-full flex-col gap-0.5 px-3 py-1.5 text-left"
                  >
                    <span className="text-foreground truncate font-mono text-xs">
                      {preview}
                    </span>
                    <span className="text-muted-foreground/80 text-[10px]">
                      {relativeTime(entry.runAt, t)} · {entry.rowCount}{" "}
                      {tCommon("unit.rows")} · {entry.elapsedMs}
                      {tCommon("unit.ms")}
                      {entry.truncated && t("history.row-meta-truncated")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {history.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="text-destructive hover:bg-muted/40 border-border w-full border-t px-3 py-1.5 text-left text-xs"
          >
            {t("history.clear")}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
