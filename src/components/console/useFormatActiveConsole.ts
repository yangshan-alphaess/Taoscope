import { toast } from "sonner";
import { useAppState } from "@/store/appState";
import { formatScratch } from "./formatScratch";

export interface UseFormatActiveConsoleResult {
  canFormat: boolean;
  format: () => void;
}

export function useFormatActiveConsole(): UseFormatActiveConsoleResult {
  const activeConsoleId = useAppState((s) => s.activeConsoleId);
  const runtime = useAppState((s) =>
    activeConsoleId ? s.consoleRuntime[activeConsoleId] : undefined,
  );
  const setScratch = useAppState((s) => s.setScratch);

  const canFormat =
    !!activeConsoleId && !!runtime && runtime.scratch.trim().length > 0;

  function format() {
    if (!canFormat || !activeConsoleId || !runtime) return;
    const result = formatScratch(runtime.scratch);
    if (result.ok) {
      setScratch(activeConsoleId, result.formatted);
    } else {
      toast.error(`Failed to format SQL: ${result.message}`);
    }
  }

  return { canFormat, format };
}
