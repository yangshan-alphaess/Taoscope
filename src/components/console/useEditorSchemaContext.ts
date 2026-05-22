/**
 * Hook that exposes the active console's connection + currentDb for the
 * editor's autocompletion source. CodeMirror sources can't call hooks
 * directly; the Editor reads this and forwards the value into a ref the
 * completion source closes over.
 */

import { useAppState } from "@/store/appState";

export interface EditorSchemaContext {
  connectionId: string | null;
  db: string | null;
  online: boolean;
}

export function useEditorSchemaContext(): EditorSchemaContext {
  const activeId = useAppState((s) => s.activeConsoleId);
  const console = useAppState((s) =>
    activeId ? s.consoles.find((c) => c.id === activeId) : undefined,
  );
  const connId = console?.connectionId ?? null;
  const conn = useAppState((s) =>
    connId ? s.connections.find((c) => c.id === connId) : undefined,
  );

  return {
    connectionId: connId,
    db: console?.currentDb ?? null,
    online: conn?.status === "online",
  };
}
