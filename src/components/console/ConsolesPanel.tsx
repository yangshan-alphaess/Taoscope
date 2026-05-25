import { useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { useDataSource } from "@/datasource/context";
import { useAppState } from "@/store/appState";
import { cn } from "@/lib/utils";
import { fmtShortcut } from "@/lib/platform";
import { RenamableLabel } from "@/components/console/RenamableLabel";
import { useCreateConsole } from "@/components/console/useCreateConsole";
import { confirm } from "@/components/ui/confirm";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export function ConsolesPanel() {
  const ds = useDataSource();
  const connections = useAppState((s) => s.connections);
  const consoles = useAppState((s) => s.consoles);
  const activeConsoleId = useAppState((s) => s.activeConsoleId);
  const setActiveConsole = useAppState((s) => s.setActiveConsole);
  const removeConsole = useAppState((s) => s.removeConsole);
  const renameConsoleLocal = useAppState((s) => s.renameConsoleLocal);
  const createConsole = useCreateConsole();

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);

  function toggleCollapse(connId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(connId)) next.delete(connId);
      else next.add(connId);
      return next;
    });
  }

  async function handleRename(id: string, next: string) {
    await ds.renameConsole(id, next);
    renameConsoleLocal(id, next);
  }

  async function handleDelete(id: string) {
    const name = consoles.find((c) => c.id === id)?.name ?? id;
    const ok = await confirm({
      title: `Delete console "${name}"?`,
      description:
        "The console and its saved SQL scratch will be permanently removed.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await ds.deleteConsole(id);
    removeConsole(id);
  }

  return (
    <section className="bg-background flex h-full min-h-0 flex-col">
      <div className="border-border flex h-9 shrink-0 items-center border-b px-3">
        <h2 className="text-xs font-semibold tracking-wide uppercase">
          Consoles
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto py-1 text-xs">
        {connections.length === 0 ? (
          <p className="text-muted-foreground p-3">No connections.</p>
        ) : (
          connections.map((conn) => {
            const isOpen = !collapsed.has(conn.id);
            const isOffline = conn.status === "offline";
            const group = consoles.filter((c) => c.connectionId === conn.id);
            return (
              <div key={conn.id}>
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={() => toggleCollapse(conn.id)}
                      className={cn(
                        "hover:bg-muted/40 flex w-full items-center gap-1 px-2 py-1 text-left",
                        isOffline && "text-muted-foreground/70",
                      )}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3 w-3 shrink-0" />
                      ) : (
                        <ChevronRight className="h-3 w-3 shrink-0" />
                      )}
                      <span
                        className={cn(
                          "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                          isOffline ? "bg-muted-foreground/50" : "bg-primary",
                        )}
                        aria-hidden
                      />
                      <span className="truncate font-medium">{conn.name}</span>
                      {group.length > 0 && (
                        <span className="text-muted-foreground/70 ml-auto font-mono">
                          ({group.length})
                        </span>
                      )}
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem
                      disabled={isOffline}
                      onSelect={() => {
                        void createConsole(conn.id);
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

                {isOpen && (
                  <div className="ml-3">
                    {group.length === 0 ? (
                      <p className="text-muted-foreground/60 px-3 py-1 italic">
                        no consoles
                      </p>
                    ) : (
                      group.map((c) => {
                        const isActive = c.id === activeConsoleId;
                        return (
                          <ContextMenu key={c.id}>
                            <ContextMenuTrigger asChild>
                              <div
                                onClick={() => {
                                  if (!isActive) setActiveConsole(c.id);
                                }}
                                className={cn(
                                  "group hover:bg-muted/40 flex cursor-pointer items-center gap-2 px-2 py-1",
                                  isActive
                                    ? "text-foreground bg-muted/60 font-medium"
                                    : "text-muted-foreground",
                                )}
                              >
                                <span
                                  className={cn(
                                    "inline-block h-1 w-1 shrink-0 rounded-full",
                                    isActive
                                      ? "bg-primary"
                                      : "bg-muted-foreground/40",
                                  )}
                                  aria-hidden
                                />
                                <RenamableLabel
                                  value={c.name}
                                  startEditing={renamingId === c.id}
                                  onEditingChange={(editing) => {
                                    if (!editing && renamingId === c.id) {
                                      setRenamingId(null);
                                    }
                                  }}
                                  onRename={(next) =>
                                    handleRename(c.id, next)
                                  }
                                />
                                <span className="text-muted-foreground/60 ml-auto font-mono text-[10px]">
                                  {c.currentDb ?? "—"}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleDelete(c.id);
                                  }}
                                  className="hover:bg-muted ml-1 rounded-sm p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                                  aria-label="Delete console"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem
                                onSelect={() => setRenamingId(c.id)}
                              >
                                Rename
                              </ContextMenuItem>
                              <ContextMenuItem
                                onSelect={() => {
                                  void handleDelete(c.id);
                                }}
                                className="text-destructive focus:text-destructive"
                              >
                                Delete
                                <span className="text-muted-foreground ml-auto pl-3 text-xs">
                                  {fmtShortcut(["Mod", "W"])}
                                </span>
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
