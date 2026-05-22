import { Settings, Maximize2 } from "lucide-react";

export function TitleBar() {
  return (
    <div
      data-tauri-drag-region
      className="bg-background border-border flex h-10 shrink-0 items-center border-b px-4 pl-20 select-none"
    >
      {/* pl-20 reserves space for macOS traffic lights on the left */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-2"
      >
        <div className="bg-primary h-3 w-3 rounded-sm" aria-hidden />
        <span className="text-sm font-medium">Taoscope</span>
      </div>

      <div
        data-tauri-drag-region
        className="flex flex-1 items-center justify-center"
      >
        <span className="text-muted-foreground text-xs">
          conn: <span className="font-mono">—</span>
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          className="hover:bg-muted text-muted-foreground hover:text-foreground rounded-md p-1.5 transition-colors"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="hover:bg-muted text-muted-foreground hover:text-foreground rounded-md p-1.5 transition-colors"
          aria-label="Maximize"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
