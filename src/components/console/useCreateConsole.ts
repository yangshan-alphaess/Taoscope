import { useCallback } from "react";
import { useDataSource } from "@/datasource/context";
import { useAppState } from "@/store/appState";
import type { Console } from "@/datasource/types";

/**
 * Hook returning a function that creates a new console under the given
 * connection, opens it in the TabBar, and activates it.
 *
 * If the SchemaPanel is currently expanded on a database that belongs to the
 * same connection, the new console's `currentDb` defaults to that database.
 */
export function useCreateConsole() {
  const ds = useDataSource();
  const currentConnectionId = useAppState((s) => s.currentConnectionId);
  const schemaBrowsingDb = useAppState((s) => s.schemaBrowsingDb);
  const addConsole = useAppState((s) => s.addConsole);
  const openConsole = useAppState((s) => s.openConsole);
  const setConsoleDbLocal = useAppState((s) => s.setConsoleDbLocal);

  return useCallback(
    async (connectionId: string): Promise<Console> => {
      const created = await ds.createConsole({ connectionId });
      addConsole(created);
      openConsole(created.id);

      // If the user is currently browsing a database in this same connection,
      // seed the new console's currentDb with it.
      if (
        schemaBrowsingDb &&
        currentConnectionId === connectionId &&
        created.currentDb !== schemaBrowsingDb
      ) {
        await ds.updateConsoleDb(created.id, schemaBrowsingDb);
        setConsoleDbLocal(created.id, schemaBrowsingDb);
      }
      return created;
    },
    [
      ds,
      addConsole,
      openConsole,
      setConsoleDbLocal,
      currentConnectionId,
      schemaBrowsingDb,
    ],
  );
}
