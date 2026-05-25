import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { Play, Square, WandSparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtShortcut } from "@/lib/platform";
import { ConsoleDbPicker } from "./ConsoleDbPicker";
import { QueryHistoryButton } from "./QueryHistoryButton";
import { useFormatActiveConsole } from "./useFormatActiveConsole";
import { useRunActiveConsole } from "./useRunActiveConsole";

export function Toolbar() {
  const { canRun, isRunning, run } = useRunActiveConsole();
  const { canFormat, format } = useFormatActiveConsole();

  return (
    <div className="border-border bg-background flex h-9 shrink-0 items-center gap-1 border-b px-2">
      <ToolbarButton
        onClick={run}
        disabled={!canRun}
        title={fmtShortcut(["Mod", "Enter"])}
        icon={<Play className="h-3.5 w-3.5" />}
        label={isRunning ? "Running…" : "Run"}
        primary
      />
      <ToolbarButton
        onClick={format}
        disabled={!canFormat}
        title={fmtShortcut(["Mod", "Shift", "F"])}
        icon={<WandSparkles className="h-3.5 w-3.5" />}
        label="Format"
      />
      <QueryHistoryButton />
      <ToolbarButton
        disabled
        title="Cancel running query (coming soon)"
        icon={<Square className="h-3.5 w-3.5" />}
        label="Cancel"
      />
      <div className="flex-1" />
      <ConsoleDbPicker />
    </div>
  );
}

interface ToolbarButtonProps
  extends Omit<ComponentPropsWithoutRef<"button">, "type"> {
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
}

const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  function ToolbarButton(
    { icon, label, onClick, disabled, primary, title, className, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
          disabled
            ? "text-muted-foreground/60 cursor-not-allowed"
            : primary
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          className,
        )}
        {...rest}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  },
);
