import { useEffect, useRef, useState } from "react";
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
  const consoleFlashNonce = useAppState((s) => s.consoleFlashNonce);
  const createConsole = useCreateConsole();

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);

  // Flash the active console so a switch triggered elsewhere (e.g. double-
  // clicking a database in the resource tree) catches the eye — including when
  // the bound console was already active (driven by the pulse nonce).
  const [flash, setFlash] = useState<{ id: string; tick: number } | null>(null);
  const prevActiveRef = useRef<string | null>(activeConsoleId);
  const prevNonceRef = useRef(consoleFlashNonce);
  useEffect(() => {
    const activeChanged = activeConsoleId !== prevActiveRef.current;
    const pulsed = consoleFlashNonce !== prevNonceRef.current;
    if ((activeChanged || pulsed) && activeConsoleId) {
      setFlash({ id: activeConsoleId, tick: Date.now() });
    }
    prevActiveRef.current = activeConsoleId;
    prevNonceRef.current = consoleFlashNonce;
  }, [activeConsoleId, consoleFlashNonce]);

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
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-background shadow-[0_2px_8px_-2px_rgba(0,0,0,0.35),inset_0_1px_0_0_hsl(0_0%_100%/0.04)]">
      <div className="flex h-9 shrink-0 items-center border-b border-border bg-gradient-to-b from-white/[0.03] to-transparent px-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide">
          {t("consoles-panel.title")}
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto py-1 text-xs">
        {connections.length === 0 ? (
          <p className="p-3 text-muted-foreground">
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
                        "mx-1 flex items-center gap-1 rounded-md px-2 py-1 text-left hover:bg-muted/40",
                        isOffline && "text-muted-foreground/70",
                      )}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3 w-3 shrink-0" />
                      ) : (
                        <ChevronRight className="h-3 w-3 shrink-0" />
                      )}
                      <span className="truncate font-medium">{conn.name}</span>
                      {group.length > 0 && (
                        <span className="ml-auto font-mono text-muted-foreground/70">
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
                        <span className="ml-2 text-xs text-muted-foreground">
                          {t("consoles-panel.menu.offline-suffix")}
                        </span>
                      )}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>

                {isOpen && (
                  <div>
                    {group.length === 0 ? (
                      <p
                        style={{ paddingLeft: 24 }}
                        className="py-1 pr-3 italic text-muted-foreground/60"
                      >
                        {t("consoles-panel.no-consoles")}
                      </p>
                    ) : (
                      group.map((c) => {
                        const isActive = c.id === activeConsoleId;
                        const isEditing = renamingId === c.id;
                        const doFlash = flash?.id === c.id;
                        return (
                          <ContextMenu key={c.id}>
                            <ContextMenuTrigger asChild>
                              <div
                                key={doFlash ? `flash-${flash.tick}` : c.id}
                                onClick={() => {
                                  if (!isActive) setActiveConsole(c.id);
                                }}
                                style={{ paddingLeft: 24 }}
                                className={cn(
                                  "group mx-1 flex cursor-pointer items-center gap-2 rounded-md py-1 pr-2",
                                  isActive
                                    ? "bg-accent font-medium text-foreground"
                                    : "text-muted-foreground hover:bg-muted/40",
                                  doFlash && "animate-attention-flash",
                                )}
                              >
                                <RenamableLabel
                                  value={c.name}
                                  startEditing={renamingId === c.id}
                                  onEditingChange={(editing) => {
                                    if (!editing && renamingId === c.id) {
                                      setRenamingId(null);
                                    }
                                  }}
                                  onRename={(next) => handleRename(c.id, next)}
                                  inputClassName="min-w-0 flex-1"
                                />
                                {/* While renaming, hide the db name + action
                                    icons so the edit input has full room. */}
                                {!isEditing && (
                                  <>
                                    <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">
                                      {c.currentDb ?? "—"}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setRenamingId(c.id);
                                      }}
                                      className="ml-1 rounded-sm p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                                      aria-label={t(
                                        "consoles-panel.rename-tooltip",
                                      )}
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
                                      className="rounded-sm p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                                      aria-label={t(
                                        "consoles-panel.delete-tooltip",
                                      )}
                                      title={t("consoles-panel.delete-tooltip")}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </>
                                )}
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
                                <span className="ml-auto pl-3 text-xs text-muted-foreground">
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
