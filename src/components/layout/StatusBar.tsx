import { useAppState } from "@/store/appState";
import { cn } from "@/lib/utils";

export function StatusBar() {
  const execStatus = useAppState((s) => s.execStatus);
  const execError = useAppState((s) => s.execError);
  const lastResult = useAppState((s) => s.lastResult);

  let leftLabel: string;
  switch (execStatus) {
    case "ready":
      leftLabel = "ready";
      break;
    case "running":
      leftLabel = "running…";
      break;
    case "ok":
      leftLabel = "OK";
      break;
    case "error":
      leftLabel = `ERROR: ${execError ?? "unknown"}`;
      break;
  }

  const showStats = execStatus === "ok" && lastResult !== null;

  return (
    <footer className="bg-background border-border text-muted-foreground flex h-6 shrink-0 items-center justify-between border-t px-3 text-xs">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
            execStatus === "ok"
              ? "bg-primary"
              : execStatus === "error"
                ? "bg-destructive"
                : execStatus === "running"
                  ? "bg-muted-foreground animate-pulse"
                  : "bg-muted-foreground/50",
          )}
        />
        <span className="truncate">{leftLabel}</span>
      </div>
      <div className="font-mono">
        {showStats ? `${lastResult!.rowCount} rows` : "— rows"}
      </div>
      <div className="font-mono">
        {showStats ? `${lastResult!.elapsedMs} ms` : "— ms"}
      </div>
    </footer>
  );
}
