import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  CornerDownLeft,
  Database as DbIcon,
  FilePlus,
  FileText,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useDataSource } from "@/datasource/context";
import { useAppState } from "@/store/appState";
import type {
  Column,
  Connection,
  Database,
  STable,
  Table,
} from "@/datasource/types";
import { cn } from "@/lib/utils";
import * as editorBridge from "@/components/console/editorBridge";
import { useCreateConsole } from "@/components/console/useCreateConsole";
import { ConnectionFormDialog } from "@/components/layout/ConnectionFormDialog";
import {
  loadPersistedExpansion,
  pruneByConnIds,
  savePersistedExpansion,
} from "@/components/layout/treeExpandPersist";
import { confirm } from "@/components/ui/confirm";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const CHILD_PAGE_SIZE = 50;

interface ChildLoadState {
  items: Table[];
  total: number;
  nextPage: number;
  loading: boolean;
  error: string | null;
}

type ColumnsState = Column[] | "loading" | "error";

interface DialogState {
  open: boolean;
  mode: "create" | "edit";
  conn?: Connection;
}

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

function formatType(c: Column): string {
  const base = `${c.type}${c.length ? `(${c.length})` : ""}`;
  if (c.isPrimaryTs) return `${base} · ts`;
  if (c.isTag) return `${base} · tag`;
  return base;
}

function nameMatches(name: string, q: string): boolean {
  if (!q) return true;
  return name.toLowerCase().includes(q.toLowerCase());
}

function InsertButton({ name }: { name: string }) {
  return (
    <button
      type="button"
      onClick={() => editorBridge.insert(name)}
      title={`Insert "${name}"`}
      aria-label={`Insert ${name}`}
      className="text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 invisible mr-1 shrink-0 rounded-sm p-0.5 group-hover:visible"
    >
      <CornerDownLeft className="h-3 w-3" />
    </button>
  );
}

export function ResourcesPanel() {
  const ds = useDataSource();
  const connections = useAppState((s) => s.connections);
  const setConnections = useAppState((s) => s.setConnections);
  const createConsole = useCreateConsole();

  const [query, setQuery] = useState("");
  const [dialogState, setDialogState] = useState<DialogState>({
    open: false,
    mode: "create",
  });

  // Expansion sets keyed by path (lazy-initialized from localStorage)
  const [expandedConns, setExpandedConns] = useState<Set<string>>(
    () => new Set(loadPersistedExpansion().conns),
  );
  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(
    () => new Set(loadPersistedExpansion().dbs),
  );
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(
    () => new Set(loadPersistedExpansion().columns),
  );
  const [expandedChildren, setExpandedChildren] = useState<Set<string>>(
    () => new Set(loadPersistedExpansion().children),
  );
  const [restored, setRestored] = useState(false);

  // Lazy caches
  const [dbsByConn, setDbsByConn] = useState<
    Record<string, Database[] | "loading">
  >({});
  const [stablesByDb, setStablesByDb] = useState<
    Record<string, STable[] | "loading">
  >({});
  const [tablesByDb, setTablesByDb] = useState<
    Record<string, Table[] | "loading">
  >({});
  const [columnsByTable, setColumnsByTable] = useState<
    Record<string, ColumnsState>
  >({});
  const [childrenByStable, setChildrenByStable] = useState<
    Record<string, ChildLoadState>
  >({});

  useEffect(() => {
    if (connections.length > 0) return;
    let cancelled = false;
    ds.listConnections().then((list) => {
      if (!cancelled) setConnections(list);
    });
    return () => {
      cancelled = true;
    };
  }, [ds, connections.length, setConnections]);

  // Persist expansion sets whenever any of them change.
  useEffect(() => {
    savePersistedExpansion({
      conns: [...expandedConns],
      dbs: [...expandedDbs],
      columns: [...expandedColumns],
      children: [...expandedChildren],
    });
  }, [expandedConns, expandedDbs, expandedColumns, expandedChildren]);

  // One-shot restore: after connections load, prune stale connId-prefixed keys
  // and refetch the data needed to render the persisted expanded paths.
  useEffect(() => {
    if (restored) return;
    if (connections.length === 0) return;

    const valid = new Set(connections.map((c) => c.id));

    const cleanConns = pruneByConnIds([...expandedConns], valid);
    const cleanDbs = pruneByConnIds([...expandedDbs], valid);
    const cleanColumns = pruneByConnIds([...expandedColumns], valid);
    const cleanChildren = pruneByConnIds([...expandedChildren], valid);

    if (cleanConns.length !== expandedConns.size) {
      setExpandedConns(new Set(cleanConns));
    }
    if (cleanDbs.length !== expandedDbs.size) {
      setExpandedDbs(new Set(cleanDbs));
    }
    if (cleanColumns.length !== expandedColumns.size) {
      setExpandedColumns(new Set(cleanColumns));
    }
    if (cleanChildren.length !== expandedChildren.size) {
      setExpandedChildren(new Set(cleanChildren));
    }

    // Refetch in parallel — each fetch guards against duplicate work by
    // checking the corresponding cache before writing.
    for (const connId of cleanConns) {
      const conn = connections.find((c) => c.id === connId);
      if (!conn || conn.status !== "online") continue;
      if (dbsByConn[connId]) continue;
      setDbsByConn((prev) => ({ ...prev, [connId]: "loading" }));
      ds.listDatabases(connId)
        .then((list) => {
          setDbsByConn((prev) => ({ ...prev, [connId]: list }));
        })
        .catch(() => {
          setDbsByConn((prev) => ({ ...prev, [connId]: [] }));
        });
    }
    for (const key of cleanDbs) {
      if (stablesByDb[key] || tablesByDb[key]) continue;
      const [connId, db] = key.split("|");
      if (!connId || !db) continue;
      const conn = connections.find((c) => c.id === connId);
      if (!conn || conn.status !== "online") continue;
      setStablesByDb((prev) => ({ ...prev, [key]: "loading" }));
      setTablesByDb((prev) => ({ ...prev, [key]: "loading" }));
      Promise.all([
        ds.listSTables(connId, db),
        ds.listTables(connId, db, { page: 1, pageSize: 200 }),
      ])
        .then(([stbs, paged]) => {
          setStablesByDb((prev) => ({ ...prev, [key]: stbs }));
          setTablesByDb((prev) => ({ ...prev, [key]: paged.items }));
        })
        .catch(() => {
          setStablesByDb((prev) => ({ ...prev, [key]: [] }));
          setTablesByDb((prev) => ({ ...prev, [key]: [] }));
        });
    }
    for (const key of cleanColumns) {
      if (columnsByTable[key]) continue;
      const [connId, db, table] = key.split("|");
      if (!connId || !db || !table) continue;
      setColumnsByTable((prev) => ({ ...prev, [key]: "loading" }));
      ds.describeTable(connId, db, table)
        .then((cols) => {
          setColumnsByTable((prev) => ({ ...prev, [key]: cols }));
        })
        .catch(() => {
          setColumnsByTable((prev) => ({ ...prev, [key]: "error" }));
        });
    }
    for (const key of cleanChildren) {
      if (childrenByStable[key]) continue;
      const [connId, db, stable] = key.split("|");
      if (!connId || !db || !stable) continue;
      setChildrenByStable((prev) => ({
        ...prev,
        [key]: {
          items: [],
          total: 0,
          nextPage: 1,
          loading: true,
          error: null,
        },
      }));
      ds.listTables(connId, db, {
        stable,
        page: 1,
        pageSize: CHILD_PAGE_SIZE,
      })
        .then((paged) => {
          setChildrenByStable((prev) => ({
            ...prev,
            [key]: {
              items: paged.items,
              total: paged.total,
              nextPage: 2,
              loading: false,
              error: null,
            },
          }));
        })
        .catch(() => {
          setChildrenByStable((prev) => ({
            ...prev,
            [key]: {
              items: [],
              total: 0,
              nextPage: 1,
              loading: false,
              error: "Failed to load. Retry?",
            },
          }));
        });
    }

    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections, restored]);

  // Filter-induced auto-expansion: when filter is active, every loaded level
  // is visible regardless of explicit expansion state.
  const filterActive = query.trim() !== "";

  async function refreshConnections() {
    const list = await ds.listConnections();
    setConnections(list);
  }

  function clearConnCache(connId: string) {
    setDbsByConn((prev) => {
      const next = { ...prev };
      delete next[connId];
      return next;
    });
    setStablesByDb((prev) => {
      const next: typeof prev = {};
      for (const k of Object.keys(prev)) {
        if (!k.startsWith(`${connId}|`)) next[k] = prev[k]!;
      }
      return next;
    });
    setTablesByDb((prev) => {
      const next: typeof prev = {};
      for (const k of Object.keys(prev)) {
        if (!k.startsWith(`${connId}|`)) next[k] = prev[k]!;
      }
      return next;
    });
    setColumnsByTable((prev) => {
      const next: typeof prev = {};
      for (const k of Object.keys(prev)) {
        if (!k.startsWith(`${connId}|`)) next[k] = prev[k]!;
      }
      return next;
    });
    setChildrenByStable((prev) => {
      const next: typeof prev = {};
      for (const k of Object.keys(prev)) {
        if (!k.startsWith(`${connId}|`)) next[k] = prev[k]!;
      }
      return next;
    });
  }

  async function handleDeleteConnection(c: Connection) {
    const ok = await confirm({
      title: `Delete connection "${c.name}"?`,
      description:
        "Consoles bound to this connection remain but can no longer query.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await ds.deleteConnection(c.id);
      await refreshConnections();
      clearConnCache(c.id);
      toast.success("Connection deleted");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    }
  }

  async function handleRefreshConnection(c: Connection) {
    if (c.status === "offline") {
      toast.error(`${c.name} is offline`);
      return;
    }
    // Drop cached schema for this connection, then re-fetch databases so the
    // tree shows fresh data even if it's already expanded.
    clearConnCache(c.id);
    setExpandedConns((prev) => {
      if (prev.has(c.id)) return prev;
      const next = new Set(prev);
      next.add(c.id);
      return next;
    });
    setDbsByConn((prev) => ({ ...prev, [c.id]: "loading" }));
    try {
      const list = await ds.listDatabases(c.id);
      setDbsByConn((prev) => ({ ...prev, [c.id]: list }));
      toast.success(`Refreshed ${c.name}`);
    } catch (err) {
      setDbsByConn((prev) => ({ ...prev, [c.id]: [] }));
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    }
  }

  async function handleRefreshDatabase(connId: string, db: string) {
    const key = `${connId}|${db}`;
    // Wipe all caches scoped under this database; keep peer databases under
    // the same connection untouched.
    setStablesByDb((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setTablesByDb((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setColumnsByTable((prev) => {
      const next: typeof prev = {};
      for (const k of Object.keys(prev)) {
        if (!k.startsWith(`${key}|`)) next[k] = prev[k]!;
      }
      return next;
    });
    setChildrenByStable((prev) => {
      const next: typeof prev = {};
      for (const k of Object.keys(prev)) {
        if (!k.startsWith(`${key}|`)) next[k] = prev[k]!;
      }
      return next;
    });
    setExpandedDbs((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    setStablesByDb((prev) => ({ ...prev, [key]: "loading" }));
    setTablesByDb((prev) => ({ ...prev, [key]: "loading" }));
    try {
      const [stbs, paged] = await Promise.all([
        ds.listSTables(connId, db),
        ds.listTables(connId, db, { page: 1, pageSize: 200 }),
      ]);
      setStablesByDb((prev) => ({ ...prev, [key]: stbs }));
      setTablesByDb((prev) => ({ ...prev, [key]: paged.items }));
      toast.success(`Refreshed ${db}`);
    } catch (err) {
      setStablesByDb((prev) => ({ ...prev, [key]: [] }));
      setTablesByDb((prev) => ({ ...prev, [key]: [] }));
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    }
  }

  async function toggleConn(c: Connection) {
    const isOpen = expandedConns.has(c.id);
    setExpandedConns((prev) => {
      const next = new Set(prev);
      if (isOpen) next.delete(c.id);
      else next.add(c.id);
      return next;
    });
    if (isOpen) return;
    if (c.status === "offline") return;
    if (dbsByConn[c.id]) return;
    setDbsByConn((prev) => ({ ...prev, [c.id]: "loading" }));
    try {
      const list = await ds.listDatabases(c.id);
      setDbsByConn((prev) => ({ ...prev, [c.id]: list }));
    } catch {
      setDbsByConn((prev) => ({ ...prev, [c.id]: [] }));
    }
  }

  async function toggleDb(connId: string, db: string) {
    const key = `${connId}|${db}`;
    const isOpen = expandedDbs.has(key);
    setExpandedDbs((prev) => {
      const next = new Set(prev);
      if (isOpen) next.delete(key);
      else next.add(key);
      return next;
    });
    if (isOpen) {
      // Collapsing resets descendant expansion under this database
      setExpandedColumns((prev) => {
        const next = new Set<string>();
        for (const k of prev) if (!k.startsWith(`${key}|`)) next.add(k);
        return next;
      });
      setExpandedChildren((prev) => {
        const next = new Set<string>();
        for (const k of prev) if (!k.startsWith(`${key}|`)) next.add(k);
        return next;
      });
      setColumnsByTable((prev) => {
        const next: typeof prev = {};
        for (const k of Object.keys(prev)) {
          if (!k.startsWith(`${key}|`)) next[k] = prev[k]!;
        }
        return next;
      });
      setChildrenByStable((prev) => {
        const next: typeof prev = {};
        for (const k of Object.keys(prev)) {
          if (!k.startsWith(`${key}|`)) next[k] = prev[k]!;
        }
        return next;
      });
      return;
    }
    if (stablesByDb[key] || tablesByDb[key]) return;
    setStablesByDb((prev) => ({ ...prev, [key]: "loading" }));
    setTablesByDb((prev) => ({ ...prev, [key]: "loading" }));
    try {
      const [stbs, paged] = await Promise.all([
        ds.listSTables(connId, db),
        ds.listTables(connId, db, { page: 1, pageSize: 200 }),
      ]);
      setStablesByDb((prev) => ({ ...prev, [key]: stbs }));
      setTablesByDb((prev) => ({ ...prev, [key]: paged.items }));
    } catch {
      setStablesByDb((prev) => ({ ...prev, [key]: [] }));
      setTablesByDb((prev) => ({ ...prev, [key]: [] }));
    }
  }

  async function toggleColumns(connId: string, db: string, table: string) {
    const key = `${connId}|${db}|${table}`;
    const isOpen = expandedColumns.has(key);
    setExpandedColumns((prev) => {
      const next = new Set(prev);
      if (isOpen) next.delete(key);
      else next.add(key);
      return next;
    });
    if (isOpen) return;
    const existing = columnsByTable[key];
    if (existing && existing !== "error") return;
    setColumnsByTable((prev) => ({ ...prev, [key]: "loading" }));
    try {
      const cols = await ds.describeTable(connId, db, table);
      setColumnsByTable((prev) => ({ ...prev, [key]: cols }));
    } catch {
      setColumnsByTable((prev) => ({ ...prev, [key]: "error" }));
    }
  }

  async function toggleChildren(
    connId: string,
    db: string,
    stable: string,
  ) {
    const key = `${connId}|${db}|${stable}`;
    const isOpen = expandedChildren.has(key);
    setExpandedChildren((prev) => {
      const next = new Set(prev);
      if (isOpen) next.delete(key);
      else next.add(key);
      return next;
    });
    if (isOpen) {
      setChildrenByStable((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    setChildrenByStable((prev) => ({
      ...prev,
      [key]: {
        items: [],
        total: 0,
        nextPage: 1,
        loading: true,
        error: null,
      },
    }));
    try {
      const paged = await ds.listTables(connId, db, {
        stable,
        page: 1,
        pageSize: CHILD_PAGE_SIZE,
      });
      setChildrenByStable((prev) => ({
        ...prev,
        [key]: {
          items: paged.items,
          total: paged.total,
          nextPage: 2,
          loading: false,
          error: null,
        },
      }));
    } catch {
      setChildrenByStable((prev) => ({
        ...prev,
        [key]: {
          items: [],
          total: 0,
          nextPage: 1,
          loading: false,
          error: "Failed to load. Retry?",
        },
      }));
    }
  }

  async function loadMoreChildren(
    connId: string,
    db: string,
    stable: string,
  ) {
    const key = `${connId}|${db}|${stable}`;
    const state = childrenByStable[key];
    if (!state || state.loading) return;
    if (state.items.length >= state.total) return;
    setChildrenByStable((prev) => {
      const cur = prev[key];
      if (!cur) return prev;
      return { ...prev, [key]: { ...cur, loading: true, error: null } };
    });
    try {
      const paged = await ds.listTables(connId, db, {
        stable,
        page: state.nextPage,
        pageSize: CHILD_PAGE_SIZE,
      });
      setChildrenByStable((prev) => {
        const cur = prev[key];
        if (!cur) return prev;
        return {
          ...prev,
          [key]: {
            items: [...cur.items, ...paged.items],
            total: paged.total,
            nextPage: cur.nextPage + 1,
            loading: false,
            error: null,
          },
        };
      });
    } catch {
      setChildrenByStable((prev) => {
        const cur = prev[key];
        if (!cur) return prev;
        return {
          ...prev,
          [key]: { ...cur, loading: false, error: "Failed to load. Retry?" },
        };
      });
    }
  }

  const visibleConnections = useMemo(() => {
    if (!filterActive) return connections;
    const q = query.toLowerCase();
    return connections.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      // Check loaded descendants
      const dbs = dbsByConn[c.id];
      if (Array.isArray(dbs)) {
        for (const db of dbs) {
          if (db.name.toLowerCase().includes(q)) return true;
          const key = `${c.id}|${db.name}`;
          const stbs = stablesByDb[key];
          if (Array.isArray(stbs)) {
            for (const s of stbs) {
              if (s.name.toLowerCase().includes(q)) return true;
            }
          }
          const tbls = tablesByDb[key];
          if (Array.isArray(tbls)) {
            for (const t of tbls) {
              if (t.name.toLowerCase().includes(q)) return true;
            }
          }
          // Loaded column / child tables
          for (const colKey of Object.keys(columnsByTable)) {
            if (colKey.startsWith(`${key}|`)) {
              const cols = columnsByTable[colKey];
              if (Array.isArray(cols)) {
                for (const col of cols) {
                  if (col.name.toLowerCase().includes(q)) return true;
                }
              }
            }
          }
          for (const childKey of Object.keys(childrenByStable)) {
            if (childKey.startsWith(`${key}|`)) {
              const cs = childrenByStable[childKey];
              if (cs) {
                for (const child of cs.items) {
                  if (child.name.toLowerCase().includes(q)) return true;
                }
              }
            }
          }
        }
      }
      return false;
    });
  }, [
    connections,
    filterActive,
    query,
    dbsByConn,
    stablesByDb,
    tablesByDb,
    columnsByTable,
    childrenByStable,
  ]);

  return (
    <section className="bg-background flex h-full min-h-0 flex-col">
      <div className="border-border flex h-9 shrink-0 items-center justify-between border-b pr-1 pl-3">
        <h2 className="text-xs font-semibold tracking-wide uppercase">
          Resources
        </h2>
        <button
          type="button"
          onClick={() => setDialogState({ open: true, mode: "create" })}
          className="text-muted-foreground hover:text-foreground hover:bg-muted/50 flex items-center gap-1 rounded-sm px-2 py-1 text-xs"
          aria-label="New connection"
          title="New connection"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New connection</span>
        </button>
      </div>

      <div className="border-border flex h-9 shrink-0 items-center gap-1.5 border-b px-2">
        <Search className="text-muted-foreground/70 h-3.5 w-3.5 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter resources..."
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

      <div className="flex-1 overflow-y-auto py-1 text-xs">
        {connections.length === 0 ? (
          <p className="text-muted-foreground p-3">No connections yet.</p>
        ) : visibleConnections.length === 0 ? (
          <p className="text-muted-foreground/70 px-3 py-1 italic">
            No matches.
          </p>
        ) : (
          visibleConnections.map((c) => {
            const isOpen = filterActive || expandedConns.has(c.id);
            const isOffline = c.status === "offline";
            return (
              <div key={c.id}>
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <div className="group text-muted-foreground hover:bg-muted/50 hover:text-foreground flex w-full items-center">
                      <button
                        type="button"
                        onClick={() => void toggleConn(c)}
                        className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1 text-left"
                      >
                        {isOpen ? (
                          <ChevronDown className="h-3 w-3 shrink-0" />
                        ) : (
                          <ChevronRight className="h-3 w-3 shrink-0" />
                        )}
                        <span
                          className={cn(
                            "inline-block h-2 w-2 shrink-0 rounded-full",
                            isOffline
                              ? "bg-muted-foreground/50"
                              : "bg-primary",
                          )}
                          aria-hidden
                        />
                        <span className="truncate font-medium" title={c.name}>
                          {highlight(c.name, query)}
                        </span>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 invisible mr-1 shrink-0 rounded-sm p-1 group-hover:visible data-[state=open]:visible focus-visible:visible"
                            aria-label={`Actions for ${c.name}`}
                            title={`Actions for ${c.name}`}
                          >
                            <MoreHorizontal className="h-3 w-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            disabled={isOffline}
                            onSelect={() => {
                              void handleRefreshConnection(c);
                            }}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Refresh
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => {
                              setDialogState({
                                open: true,
                                mode: "edit",
                                conn: c,
                              });
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => {
                              void handleDeleteConnection(c);
                            }}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem
                      disabled={isOffline}
                      onSelect={() => {
                        void createConsole(c.id);
                      }}
                    >
                      New Console
                      {isOffline && (
                        <span className="text-muted-foreground ml-2 text-xs">
                          (offline)
                        </span>
                      )}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>

                {isOpen && (
                  <ConnectionBody
                    conn={c}
                    query={query}
                    filterActive={filterActive}
                    dbsByConn={dbsByConn}
                    stablesByDb={stablesByDb}
                    tablesByDb={tablesByDb}
                    columnsByTable={columnsByTable}
                    childrenByStable={childrenByStable}
                    expandedDbs={expandedDbs}
                    expandedColumns={expandedColumns}
                    expandedChildren={expandedChildren}
                    onToggleDb={toggleDb}
                    onToggleColumns={toggleColumns}
                    onToggleChildren={toggleChildren}
                    onLoadMore={loadMoreChildren}
                    onRefreshDb={handleRefreshDatabase}
                    onCreateConsoleInDb={(connId, db) =>
                      void createConsole(connId, { db })
                    }
                  />
                )}
              </div>
            );
          })
        )}
      </div>

      <ConnectionFormDialog
        open={dialogState.open}
        mode={dialogState.mode}
        initial={dialogState.conn}
        onOpenChange={(open) =>
          setDialogState((s) => ({ ...s, open }))
        }
        onSaved={() => {
          void refreshConnections();
        }}
      />
    </section>
  );
}

interface ConnectionBodyProps {
  conn: Connection;
  query: string;
  filterActive: boolean;
  dbsByConn: Record<string, Database[] | "loading">;
  stablesByDb: Record<string, STable[] | "loading">;
  tablesByDb: Record<string, Table[] | "loading">;
  columnsByTable: Record<string, ColumnsState>;
  childrenByStable: Record<string, ChildLoadState>;
  expandedDbs: Set<string>;
  expandedColumns: Set<string>;
  expandedChildren: Set<string>;
  onToggleDb: (connId: string, db: string) => void;
  onToggleColumns: (connId: string, db: string, table: string) => void;
  onToggleChildren: (connId: string, db: string, stable: string) => void;
  onLoadMore: (connId: string, db: string, stable: string) => void;
  onRefreshDb: (connId: string, db: string) => void;
  onCreateConsoleInDb: (connId: string, db: string) => void;
}

function ConnectionBody({
  conn,
  query,
  filterActive,
  dbsByConn,
  stablesByDb,
  tablesByDb,
  columnsByTable,
  childrenByStable,
  expandedDbs,
  expandedColumns,
  expandedChildren,
  onToggleDb,
  onToggleColumns,
  onToggleChildren,
  onLoadMore,
  onRefreshDb,
  onCreateConsoleInDb,
}: ConnectionBodyProps) {
  if (conn.status === "offline") {
    return (
      <div className="border-border/50 ml-3 border-l pl-2">
        <p className="text-muted-foreground/70 px-3 py-1 text-[11px] italic">
          Disconnected
        </p>
      </div>
    );
  }
  const dbs = dbsByConn[conn.id];
  if (dbs === undefined) return null;
  if (dbs === "loading") {
    return (
      <div className="border-border/50 ml-3 border-l pl-2">
        <p className="text-muted-foreground px-3 py-1 text-[11px]">
          Loading…
        </p>
      </div>
    );
  }
  if (dbs.length === 0) {
    return (
      <div className="border-border/50 ml-3 border-l pl-2">
        <p className="text-muted-foreground/70 px-3 py-1 text-[11px] italic">
          No databases.
        </p>
      </div>
    );
  }
  return (
    <div className="border-border/50 ml-3 border-l pl-1">
      {dbs.map((db) => {
        const dbKey = `${conn.id}|${db.name}`;
        const dbOpen = filterActive || expandedDbs.has(dbKey);
        return (
          <div key={db.name}>
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div className="group text-muted-foreground hover:bg-muted/50 hover:text-foreground flex w-full items-center">
                  <button
                    type="button"
                    onClick={() => onToggleDb(conn.id, db.name)}
                    className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1 text-left"
                  >
                    {dbOpen ? (
                      <ChevronDown className="h-3 w-3 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3 w-3 shrink-0" />
                    )}
                    <DbIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate" title={db.name}>
                      {highlight(db.name, query)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateConsoleInDb(conn.id, db.name);
                    }}
                    className="text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 invisible shrink-0 rounded-sm p-1 group-hover:visible"
                    aria-label={`New console in ${db.name}`}
                    title={`New console in ${db.name}`}
                  >
                    <FilePlus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRefreshDb(conn.id, db.name);
                    }}
                    className="text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 invisible mr-1 shrink-0 rounded-sm p-1 group-hover:visible"
                    aria-label={`Refresh ${db.name}`}
                    title={`Refresh ${db.name}`}
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  onSelect={() => onCreateConsoleInDb(conn.id, db.name)}
                >
                  New Console
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
            {dbOpen && (
              <DatabaseBody
                connId={conn.id}
                dbName={db.name}
                query={query}
                stablesByDb={stablesByDb}
                tablesByDb={tablesByDb}
                columnsByTable={columnsByTable}
                childrenByStable={childrenByStable}
                expandedColumns={expandedColumns}
                expandedChildren={expandedChildren}
                onToggleColumns={onToggleColumns}
                onToggleChildren={onToggleChildren}
                onLoadMore={onLoadMore}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface DatabaseBodyProps {
  connId: string;
  dbName: string;
  query: string;
  stablesByDb: Record<string, STable[] | "loading">;
  tablesByDb: Record<string, Table[] | "loading">;
  columnsByTable: Record<string, ColumnsState>;
  childrenByStable: Record<string, ChildLoadState>;
  expandedColumns: Set<string>;
  expandedChildren: Set<string>;
  onToggleColumns: (connId: string, db: string, table: string) => void;
  onToggleChildren: (connId: string, db: string, stable: string) => void;
  onLoadMore: (connId: string, db: string, stable: string) => void;
}

function DatabaseBody({
  connId,
  dbName,
  query,
  stablesByDb,
  tablesByDb,
  columnsByTable,
  childrenByStable,
  expandedColumns,
  expandedChildren,
  onToggleColumns,
  onToggleChildren,
  onLoadMore,
}: DatabaseBodyProps) {
  const dbKey = `${connId}|${dbName}`;
  const stbs = stablesByDb[dbKey];
  const tbls = tablesByDb[dbKey];
  if (stbs === "loading" || tbls === "loading" || !stbs || !tbls) {
    return (
      <div className="border-border/50 ml-3 border-l pl-1">
        <p className="text-muted-foreground px-3 py-1 text-[11px]">
          Loading…
        </p>
      </div>
    );
  }
  const visibleStables = stbs.filter((s) => nameMatches(s.name, query));
  const visibleTables = tbls.filter((t) => nameMatches(t.name, query));
  if (stbs.length === 0 && tbls.length === 0) {
    return (
      <div className="border-border/50 ml-3 border-l pl-1">
        <p className="text-muted-foreground/70 px-3 py-1 italic">empty</p>
      </div>
    );
  }
  return (
    <div className="border-border/50 ml-3 border-l pl-1">
      {visibleStables.map((stb) => {
        const tableKey = `${connId}|${dbName}|${stb.name}`;
        const colsOpen = expandedColumns.has(tableKey);
        const childrenOpen = expandedChildren.has(tableKey);
        const colsState = columnsByTable[tableKey];
        const child = childrenByStable[tableKey];
        return (
          <div key={stb.name}>
            <div className="group text-muted-foreground hover:bg-muted/50 hover:text-foreground relative flex w-full items-center">
              <button
                type="button"
                onClick={() => onToggleColumns(connId, dbName, stb.name)}
                className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1 text-left"
              >
                <Layers className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate" title={stb.name}>
                  {highlight(stb.name, query)}
                </span>
                <span className="text-muted-foreground/70 ml-auto font-mono">
                  STable · {stb.childCount}
                </span>
              </button>
            </div>
            {colsOpen && (
              <ColumnDetail state={colsState} query={query} />
            )}
            <button
              type="button"
              onClick={() => onToggleChildren(connId, dbName, stb.name)}
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
                onLoadMore={() => onLoadMore(connId, dbName, stb.name)}
              />
            )}
          </div>
        );
      })}
      {visibleStables.length === 0 && stbs.length > 0 && (
        <p className="text-muted-foreground/70 px-3 py-1 italic">
          No matches.
        </p>
      )}

      {visibleTables.map((t) => {
        const tableKey = `${connId}|${dbName}|${t.name}`;
        const open = expandedColumns.has(tableKey);
        const colsState = columnsByTable[tableKey];
        return (
          <div key={t.name}>
            <div className="group text-muted-foreground hover:bg-muted/50 hover:text-foreground relative flex w-full items-center">
              <button
                type="button"
                onClick={() => onToggleColumns(connId, dbName, t.name)}
                className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1 text-left"
              >
                <span className="w-3 shrink-0" aria-hidden />
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate" title={t.name}>
                  {highlight(t.name, query)}
                </span>
              </button>
            </div>
            {open && <ColumnDetail state={colsState} query={query} />}
          </div>
        );
      })}
      {visibleTables.length === 0 && tbls.length > 0 && (
        <p className="text-muted-foreground/70 px-3 py-1 italic">
          No matches.
        </p>
      )}
    </div>
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
        <p className="text-muted-foreground px-3 py-0.5 text-[10px]">
          Loading…
        </p>
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
  const visible = state.filter((c) => nameMatches(c.name, query));
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
            className="group hover:bg-muted/40 flex items-center gap-2 px-3 py-0.5 text-[10px]"
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
            <InsertButton name={c.name} />
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
  const visible = state.items.filter((t) => nameMatches(t.name, query));
  const remaining = state.total - state.items.length;
  return (
    <div className="border-border/50 ml-3 border-l pl-1">
      {visible.length === 0 && state.items.length > 0 ? (
        <p className="text-muted-foreground/70 px-3 py-1 italic">
          No matches.
        </p>
      ) : (
        visible.map((t) => (
          <div
            key={t.name}
            className="group text-muted-foreground hover:bg-muted/40 flex items-center px-3 py-0.5 font-mono text-xs"
            title={t.name}
          >
            <span className="truncate">{highlight(t.name, query)}</span>
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
        <p className="text-destructive px-3 py-0.5 text-[10px]">
          {state.error}
        </p>
      )}
    </div>
  );
}
