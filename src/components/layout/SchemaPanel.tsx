import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Database as DbIcon, FileText, Layers } from "lucide-react";
import { useDataSource } from "@/datasource/context";
import { useAppState } from "@/store/appState";
import type { Database, STable, Table } from "@/datasource/types";
import { cn } from "@/lib/utils";

const CHILD_PAGE_SIZE = 50;

interface StableChildren {
  loading: boolean;
  items: Table[];
  total: number;
}

export function SchemaPanel() {
  const ds = useDataSource();
  const connections = useAppState((s) => s.connections);
  const currentConnectionId = useAppState((s) => s.currentConnectionId);
  const currentDatabase = useAppState((s) => s.currentDatabase);
  const setDatabase = useAppState((s) => s.setDatabase);

  const currentConn = connections.find((c) => c.id === currentConnectionId) ?? null;
  const isOffline = currentConn?.status === "offline";

  const [databases, setDatabases] = useState<Database[]>([]);
  const [databasesLoading, setDatabasesLoading] = useState(false);

  const [stables, setStables] = useState<STable[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [dbContentLoading, setDbContentLoading] = useState(false);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [children, setChildren] = useState<Record<string, StableChildren>>({});

  // Fetch databases when current online connection changes.
  useEffect(() => {
    if (!currentConnectionId || isOffline) {
      setDatabases([]);
      return;
    }
    let cancelled = false;
    setDatabasesLoading(true);
    ds.listDatabases(currentConnectionId).then((list) => {
      if (cancelled) return;
      setDatabases(list);
      setDatabasesLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ds, currentConnectionId, isOffline]);

  // Fetch the database's STables + non-child tables when currentDatabase changes.
  useEffect(() => {
    if (!currentConnectionId || !currentDatabase || isOffline) {
      setStables([]);
      setTables([]);
      setExpanded(new Set());
      setChildren({});
      return;
    }
    let cancelled = false;
    setDbContentLoading(true);
    Promise.all([
      ds.listSTables(currentConnectionId, currentDatabase),
      ds.listTables(currentConnectionId, currentDatabase, {
        page: 1,
        pageSize: 200,
      }),
    ]).then(([stbs, paged]) => {
      if (cancelled) return;
      setStables(stbs);
      setTables(paged.items);
      setExpanded(new Set());
      setChildren({});
      setDbContentLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ds, currentConnectionId, currentDatabase, isOffline]);

  function toggleStable(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
        return next;
      }
      next.add(name);
      return next;
    });
    if (!children[name] && currentConnectionId && currentDatabase) {
      setChildren((prev) => ({
        ...prev,
        [name]: { loading: true, items: [], total: 0 },
      }));
      ds
        .listTables(currentConnectionId, currentDatabase, {
          stable: name,
          page: 1,
          pageSize: CHILD_PAGE_SIZE,
        })
        .then((paged) => {
          setChildren((prev) => ({
            ...prev,
            [name]: {
              loading: false,
              items: paged.items,
              total: paged.total,
            },
          }));
        });
    }
  }

  return (
    <section className="bg-background border-border flex w-64 shrink-0 flex-col border-r">
      <div className="border-border flex h-9 shrink-0 items-center border-b px-3">
        <h2 className="text-xs font-semibold tracking-wide uppercase">
          Schema
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!currentConnectionId ? (
          <p className="text-muted-foreground p-3 text-xs">
            Select a connection
          </p>
        ) : isOffline ? (
          <p className="text-muted-foreground p-3 text-xs">Disconnected</p>
        ) : databasesLoading ? (
          <p className="text-muted-foreground p-3 text-xs">Loading…</p>
        ) : databases.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs">
            No databases.
          </p>
        ) : (
          <ul className="py-1 text-xs">
            {databases.map((db) => {
              const selected = db.name === currentDatabase;
              return (
                <li key={db.name}>
                  <button
                    type="button"
                    onClick={() => setDatabase(db.name)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors",
                      selected
                        ? "bg-muted text-foreground font-medium"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    <DbIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{db.name}</span>
                  </button>

                  {selected && (
                    <div className="border-border ml-2 border-l pl-1">
                      {dbContentLoading ? (
                        <p className="text-muted-foreground px-3 py-1">
                          Loading…
                        </p>
                      ) : (
                        <>
                          {stables.map((stb) => {
                            const isOpen = expanded.has(stb.name);
                            const child = children[stb.name];
                            return (
                              <div key={stb.name}>
                                <button
                                  type="button"
                                  onClick={() => toggleStable(stb.name)}
                                  className="text-muted-foreground hover:bg-muted/50 hover:text-foreground flex w-full items-center gap-1 px-2 py-1 text-left"
                                >
                                  {isOpen ? (
                                    <ChevronDown className="h-3 w-3 shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3 shrink-0" />
                                  )}
                                  <Layers className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">{stb.name}</span>
                                  <span className="text-muted-foreground/70 ml-auto font-mono">
                                    {stb.childCount}
                                  </span>
                                </button>
                                {isOpen && (
                                  <div className="border-border/50 ml-3 border-l pl-1">
                                    {!child || child.loading ? (
                                      <p className="text-muted-foreground px-3 py-1">
                                        Loading…
                                      </p>
                                    ) : (
                                      <>
                                        {child.items.map((t) => (
                                          <div
                                            key={t.name}
                                            className="text-muted-foreground px-3 py-0.5 font-mono"
                                          >
                                            {t.name}
                                          </div>
                                        ))}
                                        {child.total > child.items.length && (
                                          <div className="text-muted-foreground/70 px-3 py-1 italic">
                                            and {child.total - child.items.length} more
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {tables.map((t) => (
                            <div
                              key={t.name}
                              className="text-muted-foreground flex items-center gap-1 px-2 py-1"
                            >
                              <span className="w-3 shrink-0" aria-hidden />
                              <FileText className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{t.name}</span>
                            </div>
                          ))}

                          {stables.length === 0 && tables.length === 0 && (
                            <p className="text-muted-foreground/70 px-3 py-1 italic">
                              empty
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
