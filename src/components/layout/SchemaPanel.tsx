import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Database as DbIcon,
  FileText,
  Layers,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useDataSource } from "@/datasource/context";
import { useAppState } from "@/store/appState";
import type { Column, Database, STable, Table } from "@/datasource/types";
import { cn } from "@/lib/utils";

const CHILD_PAGE_SIZE = 50;

interface ChildLoadState {
  items: Table[];
  total: number;
  nextPage: number;
  loading: boolean;
  error: string | null;
}

type ColumnsState = Column[] | "loading" | "error";

function highlight(text: string, q: string): ReactNode {
  if (!q) return text;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/30 text-foreground rounded-sm px-0.5">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function filterByQuery<T>(list: T[], q: string, key: (t: T) => string): T[] {
  if (!q) return list;
  const needle = q.toLowerCase();
  return list.filter((item) => key(item).toLowerCase().includes(needle));
}

function formatType(c: Column): string {
  const base = `${c.type}${c.length ? `(${c.length})` : ""}`;
  if (c.isPrimaryTs) return `${base} · ts`;
  if (c.isTag) return `${base} · tag`;
  return base;
}

export function SchemaPanel() {
  const ds = useDataSource();
  const connections = useAppState((s) => s.connections);
  const currentConnectionId = useAppState((s) => s.currentConnectionId);
  // `schemaBrowsingDb` is intentionally UI-only state for the SchemaPanel's
  // expanded database. It does NOT drive any SQL execution. Each Console
  // owns its own `currentDb` independently.
  const browsingDb = useAppState((s) => s.schemaBrowsingDb);
  const setBrowsingDb = useAppState((s) => s.setSchemaBrowsingDb);

  const currentConn = connections.find((c) => c.id === currentConnectionId) ?? null;
  const isOffline = currentConn?.status === "offline";

  const [query, setQuery] = useState("");

  const [databases, setDatabases] = useState<Database[]>([]);
  const [databasesLoading, setDatabasesLoading] = useState(false);

  const [stables, setStables] = useState<STable[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [dbContentLoading, setDbContentLoading] = useState(false);

  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(new Set());
  const [expandedChildren, setExpandedChildren] = useState<Set<string>>(new Set());
  const [children, setChildren] = useState<Record<string, ChildLoadState>>({});
  const [tableColumns, setTableColumns] = useState<Record<string, ColumnsState>>({});

  // Fetch databases when current online connection changes.
  useEffect(() => {
    setQuery("");
    setExpandedColumns(new Set());
    setExpandedChildren(new Set());
    setChildren({});
    setTableColumns({});
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

  // Fetch the database's STables + non-child tables when browsingDb changes.
  useEffect(() => {
    setExpandedColumns(new Set());
    setExpandedChildren(new Set());
    setChildren({});
    setTableColumns({});
    if (!currentConnectionId || !browsingDb || isOffline) {
      setStables([]);
      setTables([]);
      return;
    }
    let cancelled = false;
    setDbContentLoading(true);
    Promise.all([
      ds.listSTables(currentConnectionId, browsingDb),
      ds.listTables(currentConnectionId, browsingDb, {
        page: 1,
        pageSize: 200,
      }),
    ]).then(([stbs, paged]) => {
      if (cancelled) return;
      setStables(stbs);
      setTables(paged.items);
      setDbContentLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ds, currentConnectionId, browsingDb, isOffline]);

  async function toggleColumns(table: string) {
    const isOpen = expandedColumns.has(table);
    setExpandedColumns((prev) => {
      const next = new Set(prev);
      if (isOpen) next.delete(table);
      else next.add(table);
      return next;
    });
    if (isOpen) return;
    const existing = tableColumns[table];
    if (existing && existing !== "error" && existing !== "loading") return;
    if (existing === "loading") return;
    if (!currentConnectionId || !browsingDb) return;
    setTableColumns((prev) => ({ ...prev, [table]: "loading" }));
    try {
      const cols = await ds.describeTable(currentConnectionId, browsingDb, table);
      setTableColumns((prev) => ({ ...prev, [table]: cols }));
    } catch {
      setTableColumns((prev) => ({ ...prev, [table]: "error" }));
    }
  }

  async function toggleChildren(stable: string) {
    const isOpen = expandedChildren.has(stable);
    setExpandedChildren((prev) => {
      const next = new Set(prev);
      if (isOpen) next.delete(stable);
      else next.add(stable);
      return next;
    });
    if (isOpen) {
      // Discard loaded items so re-expansion restarts from page 1.
      setChildren((prev) => {
        if (!(stable in prev)) return prev;
        const next = { ...prev };
        delete next[stable];
        return next;
      });
      return;
    }
    if (!currentConnectionId || !browsingDb) return;
    setChildren((prev) => ({
      ...prev,
      [stable]: {
        items: [],
        total: 0,
        nextPage: 1,
        loading: true,
        error: null,
      },
    }));
    try {
      const paged = await ds.listTables(currentConnectionId, browsingDb, {
        stable,
        page: 1,
        pageSize: CHILD_PAGE_SIZE,
      });
      setChildren((prev) => ({
        ...prev,
        [stable]: {
          items: paged.items,
          total: paged.total,
          nextPage: 2,
          loading: false,
          error: null,
        },
      }));
    } catch {
      setChildren((prev) => ({
        ...prev,
        [stable]: {
          items: [],
          total: 0,
          nextPage: 1,
          loading: false,
          error: "Failed to load. Retry?",
        },
      }));
    }
  }

  async function loadMoreChildren(stable: string) {
    const state = children[stable];
    if (!state) return;
    if (state.loading) return;
    if (state.items.length >= state.total) return;
    if (!currentConnectionId || !browsingDb) return;
    setChildren((prev) => {
      const cur = prev[stable];
      if (!cur) return prev;
      return {
        ...prev,
        [stable]: { ...cur, loading: true, error: null },
      };
    });
    try {
      const paged = await ds.listTables(currentConnectionId, browsingDb, {
        stable,
        page: state.nextPage,
        pageSize: CHILD_PAGE_SIZE,
      });
      setChildren((prev) => {
        const cur = prev[stable];
        if (!cur) return prev;
        return {
          ...prev,
          [stable]: {
            items: [...cur.items, ...paged.items],
            total: paged.total,
            nextPage: cur.nextPage + 1,
            loading: false,
            error: null,
          },
        };
      });
    } catch {
      setChildren((prev) => {
        const cur = prev[stable];
        if (!cur) return prev;
        return {
          ...prev,
          [stable]: { ...cur, loading: false, error: "Failed to load. Retry?" },
        };
      });
    }
  }

  const visibleDatabases = useMemo(
    () => filterByQuery(databases, query, (d) => d.name),
    [databases, query],
  );
  const visibleStables = useMemo(
    () => filterByQuery(stables, query, (s) => s.name),
    [stables, query],
  );
  const visibleTables = useMemo(
    () => filterByQuery(tables, query, (t) => t.name),
    [tables, query],
  );

  return (
    <section className="bg-background border-border flex w-56 shrink-0 flex-col border-r">
      <div className="border-border flex h-9 shrink-0 items-center border-b px-3">
        <h2 className="text-xs font-semibold tracking-wide uppercase">
          Schema
        </h2>
      </div>

      <div className="border-border flex h-9 shrink-0 items-center gap-1.5 border-b px-2">
        <Search className="text-muted-foreground/70 h-3.5 w-3.5 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter schema..."
          className="bg-transparent text-foreground placeholder:text-muted-foreground/60 focus:outline-none h-7 flex-1 text-xs"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="text-muted-foreground hover:text-foreground rounded-sm p-0.5"
            aria-label="Clear filter"
          >
            <X className="h-3 w-3" />
          </button>
        )}
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
            {visibleDatabases.length === 0 && databases.length > 0 && (
              <li>
                <p className="text-muted-foreground/70 px-3 py-1 italic">
                  No matches.
                </p>
              </li>
            )}
            {visibleDatabases.map((db) => {
              const selected = db.name === browsingDb;
              return (
                <li key={db.name}>
                  <button
                    type="button"
                    onClick={() => setBrowsingDb(db.name)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors",
                      selected
                        ? "bg-muted text-foreground font-medium"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    <DbIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{highlight(db.name, query)}</span>
                  </button>

                  {selected && (
                    <div className="border-border ml-2 border-l pl-1">
                      {dbContentLoading ? (
                        <p className="text-muted-foreground px-3 py-1">
                          Loading…
                        </p>
                      ) : (
                        <>
                          {visibleStables.map((stb) => {
                            const colsOpen = expandedColumns.has(stb.name);
                            const childrenOpen = expandedChildren.has(stb.name);
                            const colsState = tableColumns[stb.name];
                            const child = children[stb.name];
                            return (
                              <div key={stb.name}>
                                <button
                                  type="button"
                                  onClick={() => toggleColumns(stb.name)}
                                  className="text-muted-foreground hover:bg-muted/50 hover:text-foreground flex w-full items-center gap-1 px-2 py-1 text-left"
                                >
                                  <Layers className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate" title={stb.name}>
                                    {highlight(stb.name, query)}
                                  </span>
                                  <span className="text-muted-foreground/70 ml-auto font-mono">
                                    STable · {stb.childCount}
                                  </span>
                                </button>
                                {colsOpen && (
                                  <ColumnDetail
                                    state={colsState}
                                    query={query}
                                  />
                                )}
                                <button
                                  type="button"
                                  onClick={() => toggleChildren(stb.name)}
                                  className="text-muted-foreground/80 hover:text-foreground hover:bg-muted/40 flex items-center gap-1 px-3 py-1 text-xs"
                                >
                                  {childrenOpen ? (
                                    <ChevronDown className="h-3 w-3 shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3 shrink-0" />
                                  )}
                                  <span>Child tables</span>
                                </button>
                                {childrenOpen && (
                                  <ChildList
                                    state={child}
                                    query={query}
                                    onLoadMore={() => loadMoreChildren(stb.name)}
                                  />
                                )}
                              </div>
                            );
                          })}

                          {visibleStables.length === 0 && stables.length > 0 && (
                            <p className="text-muted-foreground/70 px-3 py-1 italic">
                              No matches.
                            </p>
                          )}

                          {visibleTables.map((t) => {
                            const open = expandedColumns.has(t.name);
                            const colsState = tableColumns[t.name];
                            return (
                              <div key={t.name}>
                                <button
                                  type="button"
                                  onClick={() => toggleColumns(t.name)}
                                  className="text-muted-foreground hover:bg-muted/50 hover:text-foreground flex w-full items-center gap-1 px-2 py-1 text-left"
                                >
                                  <span className="w-3 shrink-0" aria-hidden />
                                  <FileText className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate" title={t.name}>
                                    {highlight(t.name, query)}
                                  </span>
                                </button>
                                {open && (
                                  <ColumnDetail
                                    state={colsState}
                                    query={query}
                                  />
                                )}
                              </div>
                            );
                          })}

                          {visibleTables.length === 0 && tables.length > 0 && (
                            <p className="text-muted-foreground/70 px-3 py-1 italic">
                              No matches.
                            </p>
                          )}

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

function ColumnDetail({
  state,
  query,
}: {
  state: ColumnsState | undefined;
  query: string;
}) {
  if (!state || state === "loading") {
    return (
      <div className="border-border/50 ml-3 border-l pl-2 py-0.5">
        <p className="text-muted-foreground px-3 py-0.5 text-[10px]">Loading…</p>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="border-border/50 ml-3 border-l pl-2 py-0.5">
        <p className="text-destructive px-3 py-0.5 text-[10px]">
          Failed to load columns.
        </p>
      </div>
    );
  }
  const visible = filterByQuery(state, query, (c) => c.name);
  return (
    <div className="border-border/50 ml-3 border-l pl-2 py-0.5">
      {visible.length === 0 && state.length > 0 ? (
        <p className="text-muted-foreground/70 px-3 py-0.5 text-[10px] italic">
          No matches.
        </p>
      ) : (
        visible.map((c) => (
          <div
            key={c.name}
            className="flex items-center gap-2 px-3 py-0.5 text-[10px]"
          >
            <span
              className="text-foreground font-mono truncate"
              title={c.name}
            >
              {highlight(c.name, query)}
            </span>
            <span className="text-muted-foreground/70 ml-auto font-mono">
              {formatType(c)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function ChildList({
  state,
  query,
  onLoadMore,
}: {
  state: ChildLoadState | undefined;
  query: string;
  onLoadMore: () => void;
}) {
  if (!state) return null;
  if (state.loading && state.items.length === 0) {
    return (
      <div className="border-border/50 ml-3 border-l pl-1">
        <p className="text-muted-foreground px-3 py-1 text-xs">Loading…</p>
      </div>
    );
  }
  if (state.error && state.items.length === 0) {
    return (
      <div className="border-border/50 ml-3 border-l pl-1">
        <button
          type="button"
          onClick={onLoadMore}
          className="text-destructive hover:text-foreground px-3 py-1 text-xs"
        >
          {state.error}
        </button>
      </div>
    );
  }
  const visible = filterByQuery(state.items, query, (t) => t.name);
  const remaining = state.total - state.items.length;
  return (
    <div className="border-border/50 ml-3 border-l pl-1">
      {visible.length === 0 && state.items.length > 0 ? (
        <p className="text-muted-foreground/70 px-3 py-1 italic">No matches.</p>
      ) : (
        visible.map((t) => (
          <div
            key={t.name}
            className="text-muted-foreground px-3 py-0.5 font-mono text-xs"
            title={t.name}
          >
            {highlight(t.name, query)}
          </div>
        ))
      )}
      {remaining > 0 && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={state.loading}
          className="text-muted-foreground hover:text-foreground hover:bg-muted/40 mx-3 my-1 flex w-full items-center justify-center gap-1 rounded-sm py-1 text-xs disabled:opacity-60"
        >
          {state.loading ? (
            <span>Loading…</span>
          ) : (
            <>
              <Plus className="h-3 w-3 shrink-0" />
              <span>
                Load {CHILD_PAGE_SIZE} more ({remaining} remaining)
              </span>
            </>
          )}
        </button>
      )}
      {state.error && state.items.length > 0 && (
        <p className="text-destructive px-3 py-0.5 text-[10px]">{state.error}</p>
      )}
    </div>
  );
}
