import { useExecActiveConsole } from "./useExecActiveConsole";

export interface UseExplainActiveConsoleResult {
  canRun: boolean;
  isRunning: boolean;
  explain: () => void;
  cancel: () => void;
}

export function useExplainActiveConsole(): UseExplainActiveConsoleResult {
  const { canRun, isRunning, exec, cancel } = useExecActiveConsole("explain");
  return { canRun, isRunning, explain: exec, cancel };
}
