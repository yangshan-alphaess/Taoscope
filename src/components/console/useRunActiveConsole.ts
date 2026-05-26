import { useExecActiveConsole } from "./useExecActiveConsole";

export interface UseRunActiveConsoleResult {
  canRun: boolean;
  isRunning: boolean;
  run: () => void;
  cancel: () => void;
}

export function useRunActiveConsole(): UseRunActiveConsoleResult {
  const { canRun, isRunning, exec, cancel } = useExecActiveConsole("run");
  return { canRun, isRunning, run: exec, cancel };
}
