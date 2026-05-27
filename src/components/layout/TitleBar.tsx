import { useEffect, useState } from "react";
import { Minus, Square, X, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAppState } from "@/store/appState";
import { isTauriRuntime } from "@/datasource/factory";
import { cn } from "@/lib/utils";

function detectMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/i.test(navigator.userAgent);
}

async function runOnWindow(
  action: "minimize" | "toggleMaximize" | "close",
): Promise<void> {
  if (!isTauriRuntime()) return;
  const mod = await import("@tauri-apps/api/window");
  const win = mod.getCurrentWindow();
  if (action === "minimize") await win.minimize();
  else if (action === "toggleMaximize") await win.toggleMaximize();
  else await win.close();
}

export function TitleBar() {
  const { t } = useTranslation("common");
  const activeConsoleId = useAppState((s) => s.activeConsoleId);
  const consoles = useAppState((s) => s.consoles);
  const connections = useAppState((s) => s.connections);
  const [isMac] = useState(detectMac);
  const [isMaximized, setIsMaximized] = useState(false);

  // macOS keeps native traffic lights (top-left, overlaid by Tauri's
  // titleBarStyle: Overlay); only Windows / Linux show the custom trio.
  const showControls = !isMac && isTauriRuntime();

  useEffect(() => {
    if (!showControls) return;
    let cancelled = false;
    let unlistenFn: (() => void) | undefined;
    void (async () => {
      const mod = await import("@tauri-apps/api/window");
      const win = mod.getCurrentWindow();
      const current = await win.isMaximized();
      if (!cancelled) setIsMaximized(current);
      unlistenFn = await win.onResized(async () => {
        const next = await win.isMaximized();
        if (!cancelled) setIsMaximized(next);
      });
    })();
    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, [showControls]);

  const activeConsole = activeConsoleId
    ? (consoles.find((c) => c.id === activeConsoleId) ?? null)
    : null;
  const currentConn = activeConsole
    ? (connections.find((c) => c.id === activeConsole.connectionId) ?? null)
    : null;

  return (
    <div
      data-tauri-drag-region
      className={cn(
        // h-9 (~36px) gives the frame some breathing room. The native macOS
        // traffic lights are overlaid by the OS near the top-left; our content
        // is vertically centered in the taller bar.
        // Transparent: it sits on the gradient shell as part of the frame.
        // macOS reserves left room for the native traffic lights; elsewhere
        // the brand hugs the far-left edge.
        "flex h-9 shrink-0 items-center pr-4 select-none",
        isMac ? "pl-20" : "pl-3",
      )}
    >
      <div
        data-tauri-drag-region
        className={cn("flex items-center gap-2", isMac && "-mt-[4px]")}
      >
        <img
          src="/app-icon.svg"
          alt=""
          aria-hidden
          data-tauri-drag-region
          className="h-4 w-4 shrink-0"
        />
        <span className="text-sm font-medium leading-none">Taoscope</span>
      </div>

      <div
        data-tauri-drag-region
        className={cn(
          "flex flex-1 items-center justify-center gap-2",
          isMac && "-mt-[2px]",
        )}
      >
        <span className="text-muted-foreground text-xs leading-none">
          {t("titlebar.conn-label")}
        </span>
        <span className="text-foreground font-mono text-xs leading-none">
          {currentConn ? currentConn.name : "—"}
        </span>
        {currentConn && (
          <span
            className={cn(
              "inline-block h-2 w-2 rounded-full",
              currentConn.status === "online"
                ? "bg-primary"
                : "bg-muted-foreground/50",
            )}
            aria-hidden
          />
        )}
      </div>

      {showControls && (
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => void runOnWindow("minimize")}
            className="hover:bg-muted text-muted-foreground hover:text-foreground inline-flex h-6 w-9 items-center justify-center transition-colors"
            aria-label="Minimize"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void runOnWindow("toggleMaximize")}
            className="hover:bg-muted text-muted-foreground hover:text-foreground inline-flex h-6 w-9 items-center justify-center transition-colors"
            aria-label={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? (
              <Copy className="h-3.5 w-3.5 -scale-x-100" />
            ) : (
              <Square className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => void runOnWindow("close")}
            className="text-muted-foreground hover:bg-destructive hover:text-destructive-foreground inline-flex h-6 w-9 items-center justify-center transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
