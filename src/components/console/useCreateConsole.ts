import { useCallback } from "react";
import { useDataSource } from "@/datasource/context";
import { useAppState } from "@/store/appState";
import type { Console } from "@/datasource/types";

/**
 * Hook returning a function that creates a new console under the given
 * connection and activates it.
 */
export function useCreateConsole() {
  const ds = useDataSource();
  const addConsole = useAppState((s) => s.addConsole);
  const setActiveConsole = useAppState((s) => s.setActiveConsole);

  return useCallback(
    async (
      connectionId: string,
      opts?: { db?: string | null },
    ): Promise<Console> => {
      const created = await ds.createConsole({ connectionId });
      const targetDb = opts?.db ?? null;
      if (targetDb !== null) {
        // Persist the binding immediately so reloading / re-fetch sees it.
        await ds.updateConsoleDb(created.id, targetDb);
        created.currentDb = targetDb;
      }
      addConsole(created);
      setActiveConsole(created.id);
      return created;
    },
    [ds, addConsole, setActiveConsole],
  );
}
