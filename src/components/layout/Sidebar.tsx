import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useDataSource } from "@/datasource/context";
import { useAppState } from "@/store/appState";
import type { Connection } from "@/datasource/types";
import { cn } from "@/lib/utils";
import { useCreateConsole } from "@/components/console/useCreateConsole";
import { ConnectionFormDialog } from "@/components/layout/ConnectionFormDialog";
import { confirm } from "@/components/ui/confirm";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface DialogState {
  open: boolean;
  mode: "create" | "edit";
  conn?: Connection;
}

export function Sidebar() {
  const ds = useDataSource();
  const connections = useAppState((s) => s.connections);
  const setConnections = useAppState((s) => s.setConnections);
  const currentConnectionId = useAppState((s) => s.currentConnectionId);
  const setConnection = useAppState((s) => s.setConnection);
  const createConsole = useCreateConsole();

  const [loading, setLoading] = useState(connections.length === 0);
  const [dialogState, setDialogState] = useState<DialogState>({
    open: false,
    mode: "create",
  });

  useEffect(() => {
    let cancelled = false;
    if (connections.length > 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    ds.listConnections().then((list) => {
      if (cancelled) return;
      setConnections(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ds, connections.length, setConnections]);

  async function refreshConnections() {
    const list = await ds.listConnections();
    setConnections(list);
  }

  async function handleDelete(id: string, name: string) {
    const ok = await confirm({
      title: `Delete connection "${name}"?`,
      description:
        "Consoles bound to this connection remain but can no longer query.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await ds.deleteConnection(id);
      await refreshConnections();
      if (currentConnectionId === id) setConnection(null);
      toast.success("Connection deleted");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    }
  }

  return (
    <aside className="bg-background border-border flex w-48 shrink-0 flex-col border-r">
      <div className="border-border flex h-9 shrink-0 items-center justify-between border-b pr-1 pl-3">
        <h2 className="text-xs font-semibold tracking-wide uppercase">
          Connections
        </h2>
        <button
          type="button"
          onClick={() => setDialogState({ open: true, mode: "create" })}
          className="text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-sm p-1"
          aria-label="New connection"
          title="New connection"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-muted-foreground p-3 text-xs">Loading…</p>
        ) : connections.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs">
            No connections yet.
          </p>
        ) : (
          <ul className="py-1">
            {connections.map((c) => {
              const selected = c.id === currentConnectionId;
              const isOffline = c.status === "offline";
              return (
                <li key={c.id}>
                  <div
                    className={cn(
                      "group relative flex w-full items-center",
                      selected
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setConnection(c.id)}
                          className={cn(
                            "flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors",
                            selected && "font-medium",
                          )}
                        >
                          <span
                            className={cn(
                              "inline-block h-2 w-2 shrink-0 rounded-full",
                              isOffline
                                ? "bg-muted-foreground/50"
                                : "bg-primary",
                            )}
                            aria-hidden
                          />
                          <span className="truncate">{c.name}</span>
                        </button>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem
                          disabled={isOffline}
                          onSelect={() => {
                            void createConsole(c.id);
                          }}
                        >
                          New Console
                          {isOffline && (
                            <span className="text-muted-foreground ml-2 text-xs">
                              (offline)
                            </span>
                          )}
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDialogState({ open: true, mode: "edit", conn: c });
                      }}
                      className="text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 invisible mr-0.5 shrink-0 rounded-sm p-1 group-hover:visible"
                      aria-label={`Edit ${c.name}`}
                      title={`Edit ${c.name}`}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDelete(c.id, c.name);
                      }}
                      className="text-muted-foreground/70 hover:text-destructive hover:bg-muted/60 invisible mr-1 shrink-0 rounded-sm p-1 group-hover:visible"
                      aria-label={`Delete ${c.name}`}
                      title={`Delete ${c.name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConnectionFormDialog
        open={dialogState.open}
        mode={dialogState.mode}
        initial={dialogState.conn}
        onOpenChange={(open) =>
          setDialogState((s) => ({ ...s, open }))
        }
        onSaved={() => {
          void refreshConnections();
        }}
      />
    </aside>
  );
}
