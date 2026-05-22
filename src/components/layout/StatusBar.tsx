import { useAppState } from "@/store/appState";
import { cn } from "@/lib/utils";

export function StatusBar() {
  const activeConsoleId = useAppState((s) => s.activeConsoleId);
  const runtime = useAppState((s) =>
    activeConsoleId ? s.consoleRuntime[activeConsoleId] : undefined,
  );

  // No active console -> "ready". With a runtime, follow its execStatus.
  const status = runtime?.execStatus ?? "idle";

  let leftLabel: string;
  switch (status) {
    case "idle":
      leftLabel = "ready";
      break;
    case "running":
      leftLabel = "running…";
      break;
    case "ok":
      leftLabel = "OK";
      break;
    case "error":
      leftLabel = `ERROR: ${runtime?.execError ?? "unknown"}`;
      break;
  }

  const showStats = status === "ok" && runtime?.lastResult != null;

  return (
    <footer className="bg-background border-border text-muted-foreground flex h-6 shrink-0 items-center justify-between border-t px-3 text-xs">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
            status === "ok"
              ? "bg-primary"
              : status === "error"
                ? "bg-destructive"
                : status === "running"
                  ? "bg-muted-foreground animate-pulse"
                  : "bg-muted-foreground/50",
          )}
        />
        <span className="truncate">{leftLabel}</span>
      </div>
      <div className="font-mono">
        {showStats ? `${runtime!.lastResult!.rowCount} rows` : "— rows"}
      </div>
      <div className="font-mono">
        {showStats ? `${runtime!.lastResult!.elapsedMs} ms` : "— ms"}
      </div>
    </footer>
  );
}
