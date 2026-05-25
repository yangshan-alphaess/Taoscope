import { format as formatSql } from "sql-formatter";
import { toast } from "sonner";
import { useAppState } from "@/store/appState";

const FORMAT_OPTIONS = {
  language: "mysql" as const,
  tabWidth: 2,
  keywordCase: "upper" as const,
  linesBetweenQueries: 1,
};

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
    try {
      const formatted = formatSql(runtime.scratch, FORMAT_OPTIONS);
      setScratch(activeConsoleId, formatted);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to format SQL: ${message.slice(0, 100)}`);
    }
  }

  return { canFormat, format };
}
