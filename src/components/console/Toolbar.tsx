import { Play, Square, WandSparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRunActiveConsole } from "./useRunActiveConsole";

export function Toolbar() {
  const { canRun, isRunning, run } = useRunActiveConsole();

  return (
    <div className="border-border bg-background flex h-9 shrink-0 items-center gap-1 border-b px-2">
      <ToolbarButton
        onClick={run}
        disabled={!canRun}
        icon={<Play className="h-3.5 w-3.5" />}
        label={isRunning ? "Running…" : "Run"}
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
