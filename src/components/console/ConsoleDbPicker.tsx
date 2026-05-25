import { useEffect, useState } from "react";
import { Database as DbIcon, Check, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

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

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={
            disabled
              ? "Open a console first"
              : currentDb
                ? `Bound to database: ${currentDb}`
                : "No database bound — click to pick"
          }
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
            disabled
              ? "text-muted-foreground/60 border-border/50 cursor-not-allowed"
              : currentDb
                ? "border-border text-foreground hover:bg-muted"
                : "border-destructive/40 text-destructive hover:bg-destructive/10",
          )}
        >
          <DbIcon className="h-3.5 w-3.5" />
          <span className="font-mono">
            {currentDb ?? "no database"}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Bind console to database</span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              void loadDatabases();
            }}
            className="text-muted-foreground hover:text-foreground rounded-sm p-1"
            title="Refresh database list"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {state.kind === "loading" && (
          <div className="text-muted-foreground px-2 py-2 text-xs">
            Loading…
          </div>
        )}
        {state.kind === "error" && (
          <div className="text-destructive px-2 py-2 text-xs">
            {state.message}
          </div>
        )}
        {state.kind === "ok" && state.items.length === 0 && (
          <div className="text-muted-foreground px-2 py-2 text-xs">
            No databases.
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
              Clear binding
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
