import { X } from "lucide-react";
import { useDataSource } from "@/datasource/context";
import { useAppState } from "@/store/appState";
import { cn } from "@/lib/utils";
import { RenamableLabel } from "@/components/console/RenamableLabel";
import { confirm } from "@/components/ui/confirm";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export function TabBar() {
  const ds = useDataSource();
  const openConsoleIds = useAppState((s) => s.openConsoleIds);
  const activeConsoleId = useAppState((s) => s.activeConsoleId);
  const consoles = useAppState((s) => s.consoles);
  const connections = useAppState((s) => s.connections);
  const setActiveConsole = useAppState((s) => s.setActiveConsole);
  const closeConsole = useAppState((s) => s.closeConsole);
  const removeConsole = useAppState((s) => s.removeConsole);
  const renameConsoleLocal = useAppState((s) => s.renameConsoleLocal);

  if (openConsoleIds.length === 0) {
    return (
      <div className="border-border bg-background flex h-9 shrink-0 items-center border-b px-3">
        <p className="text-muted-foreground/70 text-xs">
          No console open. Right-click a connection to create one.
        </p>
      </div>
    );
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
    <div className="border-border bg-background flex h-9 shrink-0 items-end overflow-x-auto border-b">
      {openConsoleIds.map((id) => {
        const c = consoles.find((x) => x.id === id);
        if (!c) return null;
        const conn = connections.find((x) => x.id === c.connectionId) ?? null;
        const isActive = id === activeConsoleId;
        return (
          <ContextMenu key={id}>
            <ContextMenuTrigger asChild>
              <div
                onClick={() => setActiveConsole(id)}
                className={cn(
                  "group border-border flex h-full shrink-0 cursor-pointer items-center gap-2 border-r px-3 text-xs transition-colors",
                  isActive
                    ? "bg-background text-foreground border-b-primary -mb-px border-b-2"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                    conn?.status === "online"
                      ? "bg-primary"
                      : "bg-muted-foreground/50",
                  )}
                  aria-hidden
                />
                <RenamableLabel
                  value={c.name}
                  onRename={(next) => handleRename(id, next)}
                />
                <span className="text-muted-foreground/70 font-mono text-[10px]">
                  {conn?.name ?? "?"}/{c.currentDb ?? "—"}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeConsole(id);
                  }}
                  className="hover:bg-muted ml-1 rounded-sm p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Close tab"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                onSelect={() => {
                  // Trigger inline rename by re-using RenamableLabel double-click.
                  // We dispatch a custom event so the label enters edit mode;
                  // for simplicity, just focus a synthetic flow: open editing
                  // through a workaround — emit a focus on the tab and let
                  // user double-click. To keep it simple, we expose Rename
                  // via the context menu by directly using window.prompt as
                  // a minimal fallback.
                  const next = window.prompt("Rename console", c.name);
                  if (!next || next.trim() === "" || next === c.name) return;
                  void handleRename(id, next.trim()).catch((err) => {
                    window.alert(
                      err instanceof Error ? err.message : "Rename failed",
                    );
                  });
                }}
              >
                Rename
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => closeConsole(id)}>
                Close tab
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => {
                  void handleDelete(id);
                }}
                className="text-destructive focus:text-destructive"
              >
                Delete
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </div>
  );
}
