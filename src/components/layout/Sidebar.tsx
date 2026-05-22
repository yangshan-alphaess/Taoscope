import { useEffect, useState } from "react";
import { useDataSource } from "@/datasource/context";
import { useAppState } from "@/store/appState";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const ds = useDataSource();
  const connections = useAppState((s) => s.connections);
  const setConnections = useAppState((s) => s.setConnections);
  const currentConnectionId = useAppState((s) => s.currentConnectionId);
  const setConnection = useAppState((s) => s.setConnection);

  const [loading, setLoading] = useState(connections.length === 0);

  useEffect(() => {
    let cancelled = false;
    if (connections.length > 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    ds.listConnections().then((list) => {
      if (cancelled) return;
      setConnections(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ds, connections.length, setConnections]);

  return (
    <aside className="bg-background border-border flex w-56 shrink-0 flex-col border-r">
      <div className="border-border flex h-9 shrink-0 items-center border-b px-3">
        <h2 className="text-xs font-semibold tracking-wide uppercase">
          Connections
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-muted-foreground p-3 text-xs">Loading…</p>
        ) : connections.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs">
            No connections yet.
          </p>
        ) : (
          <ul className="py-1">
            {connections.map((c) => {
              const selected = c.id === currentConnectionId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setConnection(c.id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors",
                      selected
                        ? "bg-muted text-foreground font-medium"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-2 w-2 shrink-0 rounded-full",
                        c.status === "online"
                          ? "bg-primary"
                          : "bg-muted-foreground/50",
                      )}
                      aria-hidden
                    />
                    <span className="truncate">{c.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
