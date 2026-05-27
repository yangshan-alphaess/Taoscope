import { useEffect, useRef, useState } from "react";
import {
  Crosshair,
  Database as DbIcon,
  Check,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { useDataSource } from "@/datasource/context";
import { useAppState } from "@/store/appState";
import type { Database } from "@/datasource/types";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; items: Database[] }
  | { kind: "error"; message: string };

export function ConsoleDbPicker() {
  const { t } = useTranslation("console");
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
  const setConsoleDbLocal = useAppState((s) => s.setConsoleDbLocal);
  const requestResourceFocus = useAppState((s) => s.requestResourceFocus);
  const consoleFlashNonce = useAppState((s) => s.consoleFlashNonce);

  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>({ kind: "idle" });

  // Load the database list lazily on first open (and after a manual refresh).
  // We don't pre-fetch so the toolbar is cheap to render when the user never
  // touches the picker.
  useEffect(() => {
    if (!open) return;
    if (!connection) return;
    if (state.kind === "ok" || state.kind === "loading") return;
    void loadDatabases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connection?.id]);

  async function loadDatabases() {
    if (!connection) return;
    setState({ kind: "loading" });
    try {
      const items = await ds.listDatabases(connection.id);
      setState({ kind: "ok", items });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState({ kind: "error", message: msg });
    }
  }

  async function pick(db: string | null) {
    if (!activeConsole || !activeConsoleId) return;
    const previous = activeConsole.currentDb;
    setConsoleDbLocal(activeConsoleId, db);
    try {
      await ds.updateConsoleDb(activeConsoleId, db);
    } catch (err) {
      // Roll back optimistic update.
      setConsoleDbLocal(activeConsoleId, previous);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    }
  }

  const disabled = !activeConsole || !connection;
  const currentDb = activeConsole?.currentDb ?? null;

  // Flash the badge when the active console (or its bound db) changes, so a
  // switch driven from the resource tree draws the eye here too.
  const [flashTick, setFlashTick] = useState(0);
  const prevSigRef = useRef<string | null>(null);
  useEffect(() => {
    const sig = `${activeConsoleId ?? ""}:${currentDb ?? ""}:${consoleFlashNonce}`;
    if (prevSigRef.current !== null && prevSigRef.current !== sig) {
      setFlashTick((n) => n + 1);
    }
    prevSigRef.current = sig;
  }, [activeConsoleId, currentDb, consoleFlashNonce]);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={disabled || !currentDb}
        onClick={() => {
          if (connection && currentDb)
            requestResourceFocus(connection.id, currentDb);
        }}
        title={t("toolbar.db-picker.locate")}
        aria-label={t("toolbar.db-picker.locate")}
        className={cn(
          "flex items-center justify-center rounded-md p-1.5 transition-colors",
          disabled || !currentDb
            ? "text-muted-foreground/40"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Crosshair className="h-3.5 w-3.5" />
      </button>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            key={flashTick}
            type="button"
            disabled={disabled}
            title={
              disabled
                ? t("toolbar.db-picker.title-disabled")
                : currentDb
                  ? t("toolbar.db-picker.title-bound", { db: currentDb })
                  : t("toolbar.db-picker.title-unbound")
            }
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              disabled
                ? "cursor-not-allowed border-border/50 text-muted-foreground/60"
                : currentDb
                  ? "border-border text-foreground hover:bg-muted"
                  : "border-destructive/40 text-destructive hover:bg-destructive/10",
              flashTick > 0 && "animate-attention-flash",
            )}
          >
            <DbIcon className="h-3.5 w-3.5" />
            <span className="font-mono">
              {currentDb ?? t("toolbar.db-picker.no-database")}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>{t("toolbar.db-picker.label")}</span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                void loadDatabases();
              }}
              className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
              title={t("toolbar.db-picker.refresh-tooltip")}
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {state.kind === "loading" && (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              {t("toolbar.db-picker.loading")}
            </div>
          )}
          {state.kind === "error" && (
            <div className="px-2 py-2 text-xs text-destructive">
              {state.message}
            </div>
          )}
          {state.kind === "ok" && state.items.length === 0 && (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              {t("toolbar.db-picker.empty")}
            </div>
          )}
          {state.kind === "ok" &&
            state.items.map((d) => {
              const selected = d.name === currentDb;
              return (
                <DropdownMenuItem
                  key={d.name}
                  onSelect={() => {
                    void pick(d.name);
                  }}
                >
                  <Check
                    className={cn(
                      "h-3.5 w-3.5",
                      selected ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="font-mono">{d.name}</span>
                </DropdownMenuItem>
              );
            })}
          {currentDb !== null && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  void pick(null);
                }}
                className="text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
                {t("toolbar.db-picker.clear")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
