import { Play, Square, WandSparkles } from "lucide-react";
import { useDataSource } from "@/datasource/context";
import { useAppState } from "@/store/appState";
import { cn } from "@/lib/utils";

export function Toolbar() {
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
  const runtime = useAppState((s) =>
    activeConsoleId ? s.consoleRuntime[activeConsoleId] : undefined,
  );
  const setRunStarted = useAppState((s) => s.setRunStarted);
  const setRunOk = useAppState((s) => s.setRunOk);
  const setRunError = useAppState((s) => s.setRunError);

  const canRun =
    !!activeConsoleId &&
    !!activeConsole &&
    !!connection &&
    connection.status === "online" &&
    runtime?.execStatus !== "running";

  const running = runtime?.execStatus === "running";

  async function handleRun() {
    if (!canRun || !activeConsole || !connection || !activeConsoleId) return;
    const id = activeConsoleId;
    const scratch = runtime?.scratch ?? "";
    setRunStarted(id);
    try {
      const r = await ds.runSql(connection.id, activeConsole.currentDb, scratch);
      setRunOk(id, r);
      // Fire-and-forget persistence.
      void ds.saveResult(id, r);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRunError(id, message);
    }
  }

  return (
    <div className="border-border bg-background flex h-9 shrink-0 items-center gap-1 border-b px-2">
      <ToolbarButton
        onClick={handleRun}
        disabled={!canRun}
        icon={<Play className="h-3.5 w-3.5" />}
        label={running ? "Running…" : "Run"}
        primary
      />
      <ToolbarButton
        disabled
        icon={<WandSparkles className="h-3.5 w-3.5" />}
        label="Format"
      />
      <ToolbarButton
        disabled
        icon={<Square className="h-3.5 w-3.5" />}
        label="Cancel"
      />
      <div className="flex-1" />
    </div>
  );
}

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
}

function ToolbarButton({
  icon,
  label,
  onClick,
  disabled,
  primary,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        disabled
          ? "text-muted-foreground/60 cursor-not-allowed"
          : primary
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
