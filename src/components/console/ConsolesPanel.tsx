import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil, X } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("console");
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
      title: t("delete-confirm.title", { name }),
      description: t("delete-confirm.description"),
      confirmLabel: t("consoles-panel.menu.delete"),
      danger: true,
    });
    if (!ok) return;
    await ds.deleteConsole(id);
    removeConsole(id);
  }

  return (
    <section className="bg-background border-border/70 flex h-full min-h-0 flex-col overflow-hidden rounded-lg border shadow-[0_2px_8px_-2px_rgba(0,0,0,0.35),inset_0_1px_0_0_hsl(0_0%_100%/0.04)]">
      <div className="border-border flex h-9 shrink-0 items-center border-b bg-gradient-to-b from-white/[0.03] to-transparent px-3">
        <h2 className="text-xs font-semibold tracking-wide uppercase">
          {t("consoles-panel.title")}
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto py-1 text-xs">
        {connections.length === 0 ? (
          <p className="text-muted-foreground p-3">
            {t("consoles-panel.no-connections")}
          </p>
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
                      {t("consoles-panel.menu.new")}
                      {isOffline && (
                        <span className="text-muted-foreground ml-2 text-xs">
                          {t("consoles-panel.menu.offline-suffix")}
                        </span>
                      )}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>

                {isOpen && (
                  <div className="ml-3">
                    {group.length === 0 ? (
                      <p className="text-muted-foreground/60 px-3 py-1 italic">
                        {t("consoles-panel.no-consoles")}
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
                                  "group hover:bg-muted/40 flex cursor-pointer items-center gap-2 border-l-2 px-2 py-1",
                                  isActive
                                    ? "border-l-primary text-foreground bg-muted/60 font-medium"
                                    : "border-l-transparent text-muted-foreground",
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
                                    setRenamingId(c.id);
                                  }}
                                  className="hover:bg-muted ml-1 rounded-sm p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                                  aria-label={t("consoles-panel.rename-tooltip")}
                                  title={t("consoles-panel.rename-tooltip")}
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleDelete(c.id);
                                  }}
                                  className="hover:bg-muted rounded-sm p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                                  aria-label={t("consoles-panel.delete-tooltip")}
                                  title={t("consoles-panel.delete-tooltip")}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem
                                onSelect={() => setRenamingId(c.id)}
                              >
                                {t("consoles-panel.menu.rename")}
                              </ContextMenuItem>
                              <ContextMenuItem
                                onSelect={() => {
                                  void handleDelete(c.id);
                                }}
                                className="text-destructive focus:text-destructive"
                              >
                                {t("consoles-panel.menu.delete")}
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
