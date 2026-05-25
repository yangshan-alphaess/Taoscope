import { useEffect, useRef } from "react";

import { useDataSource } from "@/datasource/context";
import type { DataSource } from "@/datasource/types";
import { useAppState } from "@/store/appState";
import type { Connection, Console } from "@/datasource/types";
import { confirm } from "@/components/ui/confirm";

interface ShortcutState {
  consoles: Console[];
  activeConsoleId: string | null;
  connections: Connection[];
  ds: DataSource;
  addConsole: (c: Console) => void;
  setActiveConsole: (id: string | null) => void;
  removeConsole: (id: string) => void;
}

export function ConsoleShortcuts() {
  const ds = useDataSource();
  const consoles = useAppState((s) => s.consoles);
  const activeConsoleId = useAppState((s) => s.activeConsoleId);
  const connections = useAppState((s) => s.connections);
  const addConsole = useAppState((s) => s.addConsole);
  const setActiveConsole = useAppState((s) => s.setActiveConsole);
  const removeConsole = useAppState((s) => s.removeConsole);

  const stateRef = useRef<ShortcutState>({
    consoles,
    activeConsoleId,
    connections,
    ds,
    addConsole,
    setActiveConsole,
    removeConsole,
  });

  useEffect(() => {
    stateRef.current = {
      consoles,
      activeConsoleId,
      connections,
      ds,
      addConsole,
      setActiveConsole,
      removeConsole,
    };
  });

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const modOn = e.metaKey || e.ctrlKey;
      const bothMod = e.metaKey && e.ctrlKey;
      if (!modOn || bothMod) return;
      if (e.shiftKey || e.altKey) return;

      const s = stateRef.current;

      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const n = Number.parseInt(e.key, 10);
        const ordered = [...s.consoles].sort(
          (a, b) => a.createdAt - b.createdAt,
        );
        const target = ordered[n - 1];
        if (target) s.setActiveConsole(target.id);
        return;
      }

      const key = e.key.toLowerCase();

      if (key === "t") {
        e.preventDefault();
        let connId: string | null = null;
        if (s.activeConsoleId) {
          connId =
            s.consoles.find((c) => c.id === s.activeConsoleId)
              ?.connectionId ?? null;
        }
        if (!connId) {
          connId =
            s.connections.find((c) => c.status === "online")?.id ?? null;
        }
        if (!connId) return;
        s.ds
          .createConsole({ connectionId: connId })
          .then((created) => {
            s.addConsole(created);
            s.setActiveConsole(created.id);
          })
          .catch(() => {
            // silent
          });
        return;
      }

      if (key === "w") {
        e.preventDefault();
        if (!s.activeConsoleId) return;
        const active = s.consoles.find((c) => c.id === s.activeConsoleId);
        if (!active) return;
        void (async () => {
          const ok = await confirm({
            title: `Delete console "${active.name}"?`,
            description:
              "The console and its saved SQL scratch will be permanently removed.",
            confirmLabel: "Delete",
            danger: true,
          });
          if (!ok) return;
          try {
            await s.ds.deleteConsole(active.id);
            s.removeConsole(active.id);
          } catch {
            // silent
          }
        })();
        return;
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return null;
}
