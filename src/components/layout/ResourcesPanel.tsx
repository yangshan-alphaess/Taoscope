import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
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
import { useCreateConsole } from "@/components/console/useCreateConsole";
import { buildDrop, type DropKind } from "@/components/console/ddlBuilder";
import { ConnectionFormDialog } from "@/components/layout/ConnectionFormDialog";
import { ResourcesFooter } from "@/components/layout/StatusBar";
import {
  TableDesignerDialog,
  type DesignerMode,
} from "@/components/layout/TableDesignerDialog";
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
  ContextMenuSeparator,
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

interface DialogState {
  open: boolean;
  mode: "create" | "edit";
  conn?: Connection;
}

interface DesignerState {
  open: boolean;
  mode: DesignerMode | null;
  connId: string;
  db: string;
  targetName?: string;
  stableName?: string;
}

export interface OpenDesignerArgs {
  mode: DesignerMode;
  connId: string;
  db: string;
  targetName?: string;
  stableName?: string;
}

export interface DropArgs {
  kind: DropKind;
  connId: string;
  db: string;
  name: string;
}

// A single action descriptor rendered identically into both the hover "⋯"
// dropdown and the right-click context menu, so the two menus never drift.
interface MenuAction {
  key: string;
  icon: ReactNode;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Render a separator immediately before this item. */
  separatorBefore?: boolean;
}

function DropdownActions({ actions }: { actions: MenuAction[] }) {
  return (
    <>
      {actions.map((a) => (
        <Fragment key={a.key}>
          {a.separatorBefore && <DropdownMenuSeparator />}
          <DropdownMenuItem
            disabled={a.disabled}
            onSelect={a.onSelect}
            className={cn(
              a.danger && "text-destructive focus:text-destructive",
            )}
          >
            {a.icon}
            {a.label}
          </DropdownMenuItem>
        </Fragment>
      ))}
    </>
  );
}

function ContextActions({ actions }: { actions: MenuAction[] }) {
  return (
    <>
      {actions.map((a) => (
        <Fragment key={a.key}>
          {a.separatorBefore && <ContextMenuSeparator />}
          <ContextMenuItem
            disabled={a.disabled}
            onSelect={a.onSelect}
            className={cn(
              a.danger && "text-destructive focus:text-destructive",
            )}
          >
            {a.label}
          </ContextMenuItem>
        </Fragment>
      ))}
    </>
  );
}

type ColumnsState = Column[] | "loading" | "error";

interface ChildLoadState {
  items: Table[];
  total: number;
  nextPage: number;
  loading: boolean;
  error: string | null;
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

function nameMatches(name: string, q: string): boolean {
  if (!q) return true;
  return name.toLowerCase().includes(q.toLowerCase());
}

export function ResourcesPanel() {
  const { t } = useTranslation("connection");
  const { t: td } = useTranslation("designer");
  const ds = useDataSource();
  const connections = useAppState((s) => s.connections);
  const setConnections = useAppState((s) => s.setConnections);
  const consoles = useAppState((s) => s.consoles);
  const setActiveConsole = useAppState((s) => s.setActiveConsole);
  const removeConsolesByConnection = useAppState(
    (s) => s.removeConsolesByConnection,
  );
  const createConsole = useCreateConsole();

  // Double-click a database: reuse the existing console bound to that db if
  // there is one, otherwise create and open a fresh one bound to it.
  function openConsoleForDb(connId: string, db: string) {
    const existing = consoles.find(
      (c) => c.connectionId === connId && c.currentDb === db,
    );
    if (existing) {
      setActiveConsole(existing.id);
    } else {
      void createConsole(connId, { db });
    }
  }

  const [query, setQuery] = useState("");
  const [dialogState, setDialogState] = useState<DialogState>({
    open: false,
    mode: "create",
  });
  const [designer, setDesigner] = useState<DesignerState>({
    open: false,
    mode: null,
    connId: "",
    db: "",
  });

  function openDesigner(args: OpenDesignerArgs) {
    setDesigner({ open: true, ...args });
  }

  function refreshAfterSchemaChange(connId: string, db: string) {
    void handleRefreshDatabase(connId, db);
  }

  function handleDesignerSaved() {
    if (designer.mode === "create-database") {
      const c = connections.find((x) => x.id === designer.connId);
      if (c) void handleRefreshConnection(c);
    } else {
      refreshAfterSchemaChange(designer.connId, designer.db);
    }
  }

  async function handleDrop(args: DropArgs) {
    const ok = await confirm({
      title: td(`drop-confirm.${args.kind}-title`, { name: args.name }),
      description: td(`drop-confirm.${args.kind}-description`),
      confirmLabel: td("drop-confirm.confirm"),
      danger: true,
    });
    if (!ok) return;
    try {
      const db = args.kind === "database" ? null : args.db;
      await ds.runSql(args.connId, db, buildDrop(args.kind, args.db, args.name));
      toast.success(td("toast.dropped"));
      if (args.kind === "database") {
        const c = connections.find((x) => x.id === args.connId);
        if (c) void handleRefreshConnection(c);
      } else {
        refreshAfterSchemaChange(args.connId, args.db);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  // Expansion sets keyed by path (lazy-initialized from localStorage).
  // conns: connId
  // dbs:   connId|db
  // tables: connId|db|table  (the table row itself, revealing the group nodes)
  // columns: connId|db|table  (the "Columns & tags" group)
  // children: connId|db|stable (the "Child tables" group)
  const [expandedConns, setExpandedConns] = useState<Set<string>>(
    () => new Set(loadPersistedExpansion().conns),
  );
  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(
    () => new Set(loadPersistedExpansion().dbs),
  );
  const [expandedTables, setExpandedTables] = useState<Set<string>>(
    () => new Set(loadPersistedExpansion().tables),
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

  useEffect(() => {
    savePersistedExpansion({
      conns: [...expandedConns],
      dbs: [...expandedDbs],
      tables: [...expandedTables],
      columns: [...expandedColumns],
      children: [...expandedChildren],
    });
  }, [
    expandedConns,
    expandedDbs,
    expandedTables,
    expandedColumns,
    expandedChildren,
  ]);

  // One-shot restore: after connections load, prune stale connId-prefixed
  // keys and refetch the data needed to render the persisted expanded paths.
  useEffect(() => {
    if (restored) return;
    if (connections.length === 0) return;

    const valid = new Set(connections.map((c) => c.id));

    const cleanConns = pruneByConnIds([...expandedConns], valid);
    const cleanDbs = pruneByConnIds([...expandedDbs], valid);
    const cleanTables = pruneByConnIds([...expandedTables], valid);
    const cleanColumns = pruneByConnIds([...expandedColumns], valid);
    const cleanChildren = pruneByConnIds([...expandedChildren], valid);

    if (cleanConns.length !== expandedConns.size) {
      setExpandedConns(new Set(cleanConns));
    }
    if (cleanDbs.length !== expandedDbs.size) {
      setExpandedDbs(new Set(cleanDbs));
    }
    if (cleanTables.length !== expandedTables.size) {
      setExpandedTables(new Set(cleanTables));
    }
    if (cleanColumns.length !== expandedColumns.size) {
      setExpandedColumns(new Set(cleanColumns));
    }
    if (cleanChildren.length !== expandedChildren.size) {
      setExpandedChildren(new Set(cleanChildren));
    }

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
      void loadColumns(connId, db, table);
    }
    for (const key of cleanChildren) {
      if (childrenByStable[key]) continue;
      const [connId, db, stable] = key.split("|");
      if (!connId || !db || !stable) continue;
      void loadChildren(connId, db, stable);
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
    const dropPrefix = <V,>(
      map: Record<string, V>,
      prefix: string,
    ): Record<string, V> =>
      Object.fromEntries(
        Object.entries(map).filter(([k]) => !k.startsWith(prefix)),
      );
    const prefix = `${connId}|`;
    setStablesByDb((prev) => dropPrefix(prev, prefix));
    setTablesByDb((prev) => dropPrefix(prev, prefix));
    setColumnsByTable((prev) => dropPrefix(prev, prefix));
    setChildrenByStable((prev) => dropPrefix(prev, prefix));
  }

  async function handleDeleteConnection(c: Connection) {
    const consoleCount = consoles.filter(
      (k) => k.connectionId === c.id,
    ).length;
    const ok = await confirm({
      title: t("resources-panel.delete-confirm.title", { name: c.name }),
      description: t("resources-panel.delete-confirm.description", {
        count: consoleCount,
      }),
      confirmLabel: t("resources-panel.context-menu.delete"),
      danger: true,
    });
    if (!ok) return;
    try {
      await ds.deleteConnection(c.id);
      removeConsolesByConnection(c.id);
      await refreshConnections();
      clearConnCache(c.id);
      toast.success(t("toast.deleted"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    }
  }

  async function handleRefreshConnection(c: Connection) {
    if (c.status === "offline") {
      toast.error(t("toast.offline", { name: c.name }));
      return;
    }
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
      toast.success(t("toast.refreshed", { name: c.name }));
    } catch (err) {
      setDbsByConn((prev) => ({ ...prev, [c.id]: [] }));
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    }
  }

  async function handleRefreshDatabase(connId: string, db: string) {
    const key = `${connId}|${db}`;
    setExpandedDbs((prev) =>
      prev.has(key) ? prev : new Set([...prev, key]),
    );
    const dropDbPrefix = `${key}|`;
    setColumnsByTable((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([k]) => !k.startsWith(dropDbPrefix)),
      ),
    );
    setChildrenByStable((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([k]) => !k.startsWith(dropDbPrefix)),
      ),
    );
    setStablesByDb((prev) => ({ ...prev, [key]: "loading" }));
    setTablesByDb((prev) => ({ ...prev, [key]: "loading" }));

    try {
      const [stbs, paged] = await Promise.all([
        ds.listSTables(connId, db),
        ds.listTables(connId, db, { page: 1, pageSize: 200 }),
      ]);
      setStablesByDb((prev) => ({ ...prev, [key]: stbs }));
      setTablesByDb((prev) => ({ ...prev, [key]: paged.items }));
      toast.success(t("toast.refreshed", { name: db }));
    } catch (err) {
      setStablesByDb((prev) => ({ ...prev, [key]: [] }));
      setTablesByDb((prev) => ({ ...prev, [key]: [] }));
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    }

    // We cleared the column / child-table caches above; any node that is
    // currently expanded would otherwise be stuck on "loading" until the user
    // collapses and re-opens it (its load only fires on the open transition).
    // Force-reload the expanded ones so a schema change shows immediately.
    for (const k of expandedColumns) {
      if (!k.startsWith(dropDbPrefix)) continue;
      const [cId, d, table] = k.split("|");
      if (cId && d && table) void loadColumns(cId, d, table, true);
    }
    for (const k of expandedChildren) {
      if (!k.startsWith(dropDbPrefix)) continue;
      const [cId, d, stable] = k.split("|");
      if (cId && d && stable) void loadChildren(cId, d, stable, true);
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
    if (isOpen) return;
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

  function toggleTable(connId: string, db: string, table: string) {
    const key = `${connId}|${db}|${table}`;
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleColumns(connId: string, db: string, table: string) {
    const key = `${connId}|${db}|${table}`;
    const isOpen = expandedColumns.has(key);
    setExpandedColumns((prev) => {
      const next = new Set(prev);
      if (isOpen) next.delete(key);
      else next.add(key);
      return next;
    });
    if (!isOpen) void loadColumns(connId, db, table);
  }

  function toggleChildren(connId: string, db: string, stable: string) {
    const key = `${connId}|${db}|${stable}`;
    const isOpen = expandedChildren.has(key);
    setExpandedChildren((prev) => {
      const next = new Set(prev);
      if (isOpen) next.delete(key);
      else next.add(key);
      return next;
    });
    if (!isOpen) void loadChildren(connId, db, stable);
  }

  async function loadColumns(
    connId: string,
    db: string,
    table: string,
    force = false,
  ) {
    const key = `${connId}|${db}|${table}`;
    const existing = columnsByTable[key];
    if (!force && existing && existing !== "error") return;
    setColumnsByTable((prev) => ({ ...prev, [key]: "loading" }));
    try {
      const cols = await ds.describeTable(connId, db, table);
      setColumnsByTable((prev) => ({ ...prev, [key]: cols }));
    } catch {
      setColumnsByTable((prev) => ({ ...prev, [key]: "error" }));
    }
  }

  async function loadChildren(
    connId: string,
    db: string,
    stable: string,
    force = false,
  ) {
    const key = `${connId}|${db}|${stable}`;
    const existing = childrenByStable[key];
    if (!force && existing && !existing.error && existing.items.length > 0)
      return;
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
          error: t("resources-panel.tree.error"),
        },
      }));
    }
  }

  async function loadMoreChildren(connId: string, db: string, stable: string) {
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
          [key]: { ...cur, loading: false, error: t("resources-panel.tree.error") },
        };
      });
    }
  }

  const visibleConnections = useMemo(() => {
    if (!filterActive) return connections;
    const q = query.toLowerCase();
    return connections.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
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
    <section className="bg-background border-border/70 flex h-full min-h-0 flex-col overflow-hidden rounded-lg border shadow-[0_2px_8px_-2px_rgba(0,0,0,0.35),inset_0_1px_0_0_hsl(0_0%_100%/0.04)]">
      <div className="border-border flex h-9 shrink-0 items-center justify-between border-b bg-gradient-to-b from-white/[0.03] to-transparent pr-1 pl-3">
        <h2 className="min-w-0 truncate text-xs font-semibold tracking-wide uppercase">
          {t("resources-panel.title")}
        </h2>
        <button
          type="button"
          onClick={() => setDialogState({ open: true, mode: "create" })}
          className="text-primary hover:bg-muted/50 flex shrink-0 items-center justify-center rounded-md p-1.5"
          aria-label={t("resources-panel.new")}
          title={t("resources-panel.new")}
        >
          <Plus className="h-4 w-4 shrink-0" />
        </button>
      </div>

      <div className="border-border flex h-9 shrink-0 items-center gap-1.5 border-b px-2">
        <Search className="text-muted-foreground/70 h-3.5 w-3.5 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("resources-panel.filter-placeholder")}
          className="bg-transparent text-foreground placeholder:text-muted-foreground/60 focus:outline-none h-7 flex-1 text-xs"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="text-muted-foreground hover:text-foreground rounded-sm p-0.5"
            aria-label={t("resources-panel.filter-placeholder")}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-1 text-xs">
        {connections.length === 0 ? (
          <p className="text-muted-foreground p-3">
            {t("resources-panel.empty")}
          </p>
        ) : visibleConnections.length === 0 ? (
          <p className="text-muted-foreground/70 px-3 py-1 italic">
            {t("resources-panel.empty")}
          </p>
        ) : (
          visibleConnections.map((c) => {
            const isOpen = filterActive || expandedConns.has(c.id);
            const isOffline = c.status === "offline";
            const connActions: MenuAction[] = [
              {
                key: "new-console",
                icon: <FilePlus className="h-3.5 w-3.5" />,
                label: t("resources-panel.context-menu.new-console"),
                disabled: isOffline,
                onSelect: () => void createConsole(c.id),
              },
              {
                key: "new-database",
                icon: <DbIcon className="h-3.5 w-3.5" />,
                label: t("resources-panel.context-menu.new-database"),
                disabled: isOffline,
                onSelect: () =>
                  openDesigner({
                    mode: "create-database",
                    connId: c.id,
                    db: "",
                  }),
              },
              {
                key: "refresh",
                separatorBefore: true,
                icon: <RefreshCw className="h-3.5 w-3.5" />,
                label: t("resources-panel.context-menu.refresh"),
                disabled: isOffline,
                onSelect: () => void handleRefreshConnection(c),
              },
              {
                key: "edit",
                icon: <Pencil className="h-3.5 w-3.5" />,
                label: t("resources-panel.context-menu.edit"),
                onSelect: () =>
                  setDialogState({ open: true, mode: "edit", conn: c }),
              },
              {
                key: "delete",
                separatorBefore: true,
                icon: <Trash2 className="h-3.5 w-3.5" />,
                label: t("resources-panel.context-menu.delete"),
                danger: true,
                onSelect: () => void handleDeleteConnection(c),
              },
            ];
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
                        <span className="min-w-0 truncate font-medium" title={c.name}>
                          {highlight(c.name, query)}
                        </span>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 invisible mr-1 shrink-0 rounded-sm p-1 group-hover:visible data-[state=open]:visible focus-visible:visible"
                            aria-label={t("resources-panel.tooltip.actions-for", {
                              name: c.name,
                            })}
                            title={t("resources-panel.tooltip.actions-for", {
                              name: c.name,
                            })}
                          >
                            <MoreHorizontal className="h-3 w-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownActions actions={connActions} />
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextActions actions={connActions} />
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
                    expandedDbs={expandedDbs}
                    expandedTables={expandedTables}
                    expandedColumns={expandedColumns}
                    expandedChildren={expandedChildren}
                    columnsByTable={columnsByTable}
                    childrenByStable={childrenByStable}
                    onToggleDb={toggleDb}
                    onRefreshDb={handleRefreshDatabase}
                    onCreateConsoleInDb={(connId, db) =>
                      void createConsole(connId, { db })
                    }
                    onOpenConsoleForDb={openConsoleForDb}
                    onToggleTable={toggleTable}
                    onToggleColumns={toggleColumns}
                    onToggleChildren={toggleChildren}
                    onLoadMoreChildren={loadMoreChildren}
                    onOpenDesigner={openDesigner}
                    onDrop={handleDrop}
                  />
                )}
              </div>
            );
          })
        )}
      </div>

      <ResourcesFooter />

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

      <TableDesignerDialog
        open={designer.open}
        mode={designer.mode}
        connId={designer.connId}
        db={designer.db}
        targetName={designer.targetName}
        stableName={designer.stableName}
        onOpenChange={(open) => setDesigner((s) => ({ ...s, open }))}
        onSaved={handleDesignerSaved}
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
  expandedDbs: Set<string>;
  expandedTables: Set<string>;
  expandedColumns: Set<string>;
  expandedChildren: Set<string>;
  columnsByTable: Record<string, ColumnsState>;
  childrenByStable: Record<string, ChildLoadState>;
  onToggleDb: (connId: string, db: string) => void;
  onRefreshDb: (connId: string, db: string) => void;
  onCreateConsoleInDb: (connId: string, db: string) => void;
  onOpenConsoleForDb: (connId: string, db: string) => void;
  onToggleTable: (connId: string, db: string, table: string) => void;
  onToggleColumns: (connId: string, db: string, table: string) => void;
  onToggleChildren: (connId: string, db: string, stable: string) => void;
  onLoadMoreChildren: (connId: string, db: string, stable: string) => void;
  onOpenDesigner: (args: OpenDesignerArgs) => void;
  onDrop: (args: DropArgs) => void;
}

function ConnectionBody({
  conn,
  query,
  filterActive,
  dbsByConn,
  stablesByDb,
  tablesByDb,
  expandedDbs,
  expandedTables,
  expandedColumns,
  expandedChildren,
  columnsByTable,
  childrenByStable,
  onToggleDb,
  onRefreshDb,
  onCreateConsoleInDb,
  onOpenConsoleForDb,
  onToggleTable,
  onToggleColumns,
  onToggleChildren,
  onLoadMoreChildren,
  onOpenDesigner,
  onDrop,
}: ConnectionBodyProps) {
  const { t } = useTranslation("connection");
  // Disambiguate single- vs double-click on a database row: a single click
  // expands the tree (after a short delay), while a double-click opens a
  // console and must NOT toggle expansion. The pending single-click timer is
  // cancelled when a double-click lands first.
  const clickTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function handleDbClick(db: string) {
    if (clickTimers.current[db]) return;
    clickTimers.current[db] = setTimeout(() => {
      delete clickTimers.current[db];
      onToggleDb(conn.id, db);
    }, 220);
  }

  function handleDbDoubleClick(db: string) {
    const timer = clickTimers.current[db];
    if (timer) {
      clearTimeout(timer);
      delete clickTimers.current[db];
    }
    onOpenConsoleForDb(conn.id, db);
  }
  if (conn.status === "offline") {
    return (
      <div className="ml-3 pl-1">
        <p className="text-muted-foreground/70 px-3 py-1 text-[11px] italic">
          {t("resources-panel.tree.disconnected")}
        </p>
      </div>
    );
  }
  const dbs = dbsByConn[conn.id];
  if (dbs === undefined) return null;
  if (dbs === "loading") {
    return (
      <div className="ml-3 pl-1">
        <p className="text-muted-foreground px-3 py-1 text-[11px]">
          {t("resources-panel.tree.loading")}
        </p>
      </div>
    );
  }
  if (dbs.length === 0) {
    return (
      <div className="ml-3 pl-1">
        <p className="text-muted-foreground/70 px-3 py-1 text-[11px] italic">
          {t("resources-panel.tree.no-databases")}
        </p>
      </div>
    );
  }
  return (
    <div className="ml-3 pl-1">
      {dbs.map((db) => {
        const dbKey = `${conn.id}|${db.name}`;
        const dbOpen = filterActive || expandedDbs.has(dbKey);
        const dbActions: MenuAction[] = [
          {
            key: "new-console",
            icon: <FilePlus className="h-3.5 w-3.5" />,
            label: t("resources-panel.context-menu.new-console"),
            onSelect: () => onCreateConsoleInDb(conn.id, db.name),
          },
          {
            key: "new-stable",
            icon: <Layers className="h-3.5 w-3.5" />,
            label: t("resources-panel.context-menu.new-stable"),
            onSelect: () =>
              onOpenDesigner({
                mode: "create-stable",
                connId: conn.id,
                db: db.name,
              }),
          },
          {
            key: "new-table",
            icon: <FileText className="h-3.5 w-3.5" />,
            label: t("resources-panel.context-menu.new-table"),
            onSelect: () =>
              onOpenDesigner({
                mode: "create-table",
                connId: conn.id,
                db: db.name,
              }),
          },
          {
            key: "refresh",
            separatorBefore: true,
            icon: <RefreshCw className="h-3.5 w-3.5" />,
            label: t("resources-panel.context-menu.refresh"),
            onSelect: () => onRefreshDb(conn.id, db.name),
          },
          {
            key: "drop-database",
            separatorBefore: true,
            icon: <Trash2 className="h-3.5 w-3.5" />,
            label: t("resources-panel.context-menu.drop-database"),
            danger: true,
            onSelect: () =>
              onDrop({
                kind: "database",
                connId: conn.id,
                db: db.name,
                name: db.name,
              }),
          },
        ];
        return (
          <div key={db.name}>
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div className="group text-muted-foreground hover:bg-muted/50 hover:text-foreground flex w-full items-center">
                  <button
                    type="button"
                    onClick={() => handleDbClick(db.name)}
                    onDoubleClick={() => handleDbDoubleClick(db.name)}
                    className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1 text-left"
                  >
                    {dbOpen ? (
                      <ChevronDown className="h-3 w-3 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3 w-3 shrink-0" />
                    )}
                    <DbIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 truncate" title={db.name}>
                      {highlight(db.name, query)}
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className="text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 invisible mr-1 shrink-0 rounded-sm p-1 group-hover:visible data-[state=open]:visible focus-visible:visible"
                        aria-label={t("resources-panel.tooltip.actions-for", {
                          name: db.name,
                        })}
                        title={t("resources-panel.tooltip.actions-for", {
                          name: db.name,
                        })}
                      >
                        <MoreHorizontal className="h-3 w-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownActions actions={dbActions} />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextActions actions={dbActions} />
              </ContextMenuContent>
            </ContextMenu>
            {dbOpen && (
              <DatabaseBody
                connId={conn.id}
                dbName={db.name}
                query={query}
                filterActive={filterActive}
                stablesByDb={stablesByDb}
                tablesByDb={tablesByDb}
                expandedTables={expandedTables}
                expandedColumns={expandedColumns}
                expandedChildren={expandedChildren}
                columnsByTable={columnsByTable}
                childrenByStable={childrenByStable}
                onToggleTable={onToggleTable}
                onToggleColumns={onToggleColumns}
                onToggleChildren={onToggleChildren}
                onLoadMoreChildren={onLoadMoreChildren}
                onOpenDesigner={onOpenDesigner}
                onDrop={onDrop}
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
  filterActive: boolean;
  stablesByDb: Record<string, STable[] | "loading">;
  tablesByDb: Record<string, Table[] | "loading">;
  expandedTables: Set<string>;
  expandedColumns: Set<string>;
  expandedChildren: Set<string>;
  columnsByTable: Record<string, ColumnsState>;
  childrenByStable: Record<string, ChildLoadState>;
  onToggleTable: (connId: string, db: string, table: string) => void;
  onToggleColumns: (connId: string, db: string, table: string) => void;
  onToggleChildren: (connId: string, db: string, stable: string) => void;
  onLoadMoreChildren: (connId: string, db: string, stable: string) => void;
  onOpenDesigner: (args: OpenDesignerArgs) => void;
  onDrop: (args: DropArgs) => void;
}

function DatabaseBody({
  connId,
  dbName,
  query,
  filterActive,
  stablesByDb,
  tablesByDb,
  expandedTables,
  expandedColumns,
  expandedChildren,
  columnsByTable,
  childrenByStable,
  onToggleTable,
  onToggleColumns,
  onToggleChildren,
  onLoadMoreChildren,
  onOpenDesigner,
  onDrop,
}: DatabaseBodyProps) {
  const { t: tr } = useTranslation("connection");
  const dbKey = `${connId}|${dbName}`;
  const stbs = stablesByDb[dbKey];
  const tbls = tablesByDb[dbKey];
  if (stbs === "loading" || tbls === "loading" || !stbs || !tbls) {
    return (
      <div className="ml-3 pl-1">
        <p className="text-muted-foreground px-3 py-1 text-[11px]">
          {tr("resources-panel.tree.loading")}
        </p>
      </div>
    );
  }
  const visibleStables = stbs.filter((s) => nameMatches(s.name, query));
  const visibleTables = tbls.filter((t) => nameMatches(t.name, query));
  if (stbs.length === 0 && tbls.length === 0) {
    return (
      <div className="ml-3 pl-1">
        <p className="text-muted-foreground/70 px-3 py-1 italic">
          {tr("resources-panel.tree.no-tables")}
        </p>
      </div>
    );
  }
  return (
    <div className="ml-3 pl-1">
      {visibleStables.map((stb) => {
        const tblKey = `${connId}|${dbName}|${stb.name}`;
        const tblOpen = filterActive || expandedTables.has(tblKey);
        return (
          <div key={stb.name}>
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  onClick={() => onToggleTable(connId, dbName, stb.name)}
                  className="text-muted-foreground hover:bg-muted/50 hover:text-foreground flex w-full items-center gap-1 px-2 py-1 text-left"
                >
                  {tblOpen ? (
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0" />
                  )}
                  <Layers className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 truncate" title={stb.name}>
                    {highlight(stb.name, query)}
                  </span>
                  <span className="text-muted-foreground/70 ml-auto shrink-0 whitespace-nowrap font-mono">
                    {tr("resources-panel.tree.stable-badge", {
                      count: stb.childCount,
                    })}
                  </span>
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  onSelect={() =>
                    onOpenDesigner({
                      mode: "alter-stable",
                      connId,
                      db: dbName,
                      targetName: stb.name,
                    })
                  }
                >
                  {tr("resources-panel.context-menu.edit-stable")}
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() =>
                    onOpenDesigner({
                      mode: "create-child",
                      connId,
                      db: dbName,
                      stableName: stb.name,
                    })
                  }
                >
                  {tr("resources-panel.context-menu.new-child")}
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() =>
                    onDrop({
                      kind: "stable",
                      connId,
                      db: dbName,
                      name: stb.name,
                    })
                  }
                  className="text-destructive focus:text-destructive"
                >
                  {tr("resources-panel.context-menu.drop-stable")}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
            {tblOpen && (
              <TableBody
                connId={connId}
                dbName={dbName}
                tableName={stb.name}
                isStable
                childCount={stb.childCount}
                query={query}
                filterActive={filterActive}
                expandedColumns={expandedColumns}
                expandedChildren={expandedChildren}
                columnsByTable={columnsByTable}
                childrenByStable={childrenByStable}
                onToggleColumns={onToggleColumns}
                onToggleChildren={onToggleChildren}
                onLoadMoreChildren={onLoadMoreChildren}
                onOpenDesigner={onOpenDesigner}
                onDrop={onDrop}
              />
            )}
          </div>
        );
      })}
      {visibleStables.length === 0 && stbs.length > 0 && (
        <p className="text-muted-foreground/70 px-3 py-1 italic">
          {tr("resources-panel.tree.no-matches")}
        </p>
      )}

      {visibleTables.map((tbl) => {
        const tblKey = `${connId}|${dbName}|${tbl.name}`;
        const tblOpen = filterActive || expandedTables.has(tblKey);
        return (
          <div key={tbl.name}>
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  onClick={() => onToggleTable(connId, dbName, tbl.name)}
                  className="text-muted-foreground hover:bg-muted/50 hover:text-foreground flex w-full items-center gap-1 px-2 py-1 text-left"
                >
                  {tblOpen ? (
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0" />
                  )}
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 truncate" title={tbl.name}>
                    {highlight(tbl.name, query)}
                  </span>
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  onSelect={() =>
                    onOpenDesigner({
                      mode: tbl.isChild ? "alter-child-tags" : "alter-table",
                      connId,
                      db: dbName,
                      targetName: tbl.name,
                      stableName: tbl.stableName,
                    })
                  }
                >
                  {tbl.isChild
                    ? tr("resources-panel.context-menu.edit-child-tags")
                    : tr("resources-panel.context-menu.edit-table")}
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() =>
                    onDrop({
                      kind: "table",
                      connId,
                      db: dbName,
                      name: tbl.name,
                    })
                  }
                  className="text-destructive focus:text-destructive"
                >
                  {tr("resources-panel.context-menu.drop-table")}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
            {tblOpen && (
              <TableBody
                connId={connId}
                dbName={dbName}
                tableName={tbl.name}
                isStable={false}
                query={query}
                filterActive={filterActive}
                expandedColumns={expandedColumns}
                expandedChildren={expandedChildren}
                columnsByTable={columnsByTable}
                childrenByStable={childrenByStable}
                onToggleColumns={onToggleColumns}
                onToggleChildren={onToggleChildren}
                onLoadMoreChildren={onLoadMoreChildren}
                onOpenDesigner={onOpenDesigner}
                onDrop={onDrop}
              />
            )}
          </div>
        );
      })}
      {visibleTables.length === 0 && tbls.length > 0 && (
        <p className="text-muted-foreground/70 px-3 py-1 italic">
          {tr("resources-panel.tree.no-matches")}
        </p>
      )}
    </div>
  );
}

interface TableBodyProps {
  connId: string;
  dbName: string;
  tableName: string;
  isStable: boolean;
  childCount?: number;
  query: string;
  filterActive: boolean;
  expandedColumns: Set<string>;
  expandedChildren: Set<string>;
  columnsByTable: Record<string, ColumnsState>;
  childrenByStable: Record<string, ChildLoadState>;
  onToggleColumns: (connId: string, db: string, table: string) => void;
  onToggleChildren: (connId: string, db: string, stable: string) => void;
  onLoadMoreChildren: (connId: string, db: string, stable: string) => void;
  onOpenDesigner: (args: OpenDesignerArgs) => void;
  onDrop: (args: DropArgs) => void;
}

function TableBody({
  connId,
  dbName,
  tableName,
  isStable,
  childCount,
  query,
  filterActive,
  expandedColumns,
  expandedChildren,
  columnsByTable,
  childrenByStable,
  onToggleColumns,
  onToggleChildren,
  onLoadMoreChildren,
  onOpenDesigner,
  onDrop,
}: TableBodyProps) {
  const { t } = useTranslation("connection");
  const key = `${connId}|${dbName}|${tableName}`;
  const colsOpen = filterActive || expandedColumns.has(key);
  const childrenOpen = filterActive || expandedChildren.has(key);
  return (
    <div className="ml-3 pl-1">
      <button
        type="button"
        onClick={() => onToggleColumns(connId, dbName, tableName)}
        className="text-muted-foreground hover:bg-muted/50 hover:text-foreground flex w-full items-center gap-1 px-2 py-1 text-left"
      >
        {colsOpen ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <span className="min-w-0 truncate">{t("resources-panel.tree.columns-tags")}</span>
      </button>
      {colsOpen && (
        <ColumnsList state={columnsByTable[key]} query={query} />
      )}

      {isStable && (
        <>
          <button
            type="button"
            onClick={() => onToggleChildren(connId, dbName, tableName)}
            className="text-muted-foreground hover:bg-muted/50 hover:text-foreground flex w-full items-center gap-1 px-2 py-1 text-left"
          >
            {childrenOpen ? (
              <ChevronDown className="h-3 w-3 shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0" />
            )}
            <span className="min-w-0 truncate">{t("resources-panel.tree.child-tables")}</span>
            {typeof childCount === "number" && (
              <span className="text-muted-foreground/70 ml-auto shrink-0 whitespace-nowrap font-mono">
                {childCount}
              </span>
            )}
          </button>
          {childrenOpen && (
            <ChildrenList
              state={childrenByStable[key]}
              query={query}
              connId={connId}
              dbName={dbName}
              stableName={tableName}
              onLoadMore={() => onLoadMoreChildren(connId, dbName, tableName)}
              onOpenDesigner={onOpenDesigner}
              onDrop={onDrop}
            />
          )}
        </>
      )}
    </div>
  );
}

function ColumnsList({
  state,
  query,
}: {
  state: ColumnsState | undefined;
  query: string;
}) {
  const { t: tr } = useTranslation("connection");
  if (!state || state === "loading") {
    return (
      <div className="ml-3 pl-1">
        <p className="text-muted-foreground px-3 py-1 text-[11px]">
          {tr("resources-panel.tree.loading")}
        </p>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="ml-3 pl-1">
        <p className="text-destructive px-3 py-1 text-[11px]">
          {tr("resources-panel.tree.failed-columns")}
        </p>
      </div>
    );
  }
  if (state.length === 0) {
    return (
      <div className="ml-3 pl-1">
        <p className="text-muted-foreground/70 px-3 py-1 text-[11px] italic">
          {tr("resources-panel.tree.no-columns")}
        </p>
      </div>
    );
  }
  return (
    <div className="ml-3 pl-1">
      {state.map((c) => (
        <div
          key={c.name}
          className="text-muted-foreground flex w-full items-center gap-2 px-2 py-0.5"
          title={`${c.name} ${c.type}${c.length ? `(${c.length})` : ""}`}
        >
          <span className="w-3 shrink-0" aria-hidden />
          <span className="min-w-0 truncate font-mono">
            {highlight(c.name, query)}
          </span>
          <span className="text-muted-foreground/70 ml-auto shrink-0 whitespace-nowrap font-mono">
            {c.type}
            {c.length ? `(${c.length})` : ""}
            {c.isPrimaryTs ? " · pk" : c.isTag ? " · tag" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChildrenList({
  state,
  query,
  connId,
  dbName,
  stableName,
  onLoadMore,
  onOpenDesigner,
  onDrop,
}: {
  state: ChildLoadState | undefined;
  query: string;
  connId: string;
  dbName: string;
  stableName: string;
  onLoadMore: () => void;
  onOpenDesigner: (args: OpenDesignerArgs) => void;
  onDrop: (args: DropArgs) => void;
}) {
  const { t: tr } = useTranslation("connection");
  if (!state) {
    return (
      <div className="ml-3 pl-1">
        <p className="text-muted-foreground px-3 py-1 text-[11px]">
          {tr("resources-panel.tree.loading")}
        </p>
      </div>
    );
  }
  if (state.error && state.items.length === 0) {
    return (
      <div className="ml-3 pl-1 px-3 py-1">
        <p className="text-destructive text-[11px]">{state.error}</p>
        <button
          type="button"
          onClick={onLoadMore}
          className="text-muted-foreground hover:text-foreground mt-1 text-[11px] underline"
        >
          {tr("resources-panel.tree.retry")}
        </button>
      </div>
    );
  }
  if (state.items.length === 0 && !state.loading) {
    return (
      <div className="ml-3 pl-1">
        <p className="text-muted-foreground/70 px-3 py-1 text-[11px] italic">
          {tr("resources-panel.tree.no-child-tables")}
        </p>
      </div>
    );
  }
  const remaining = state.total - state.items.length;
  return (
    <div className="ml-3 pl-1">
      {state.items.map((t) => (
        <ContextMenu key={t.name}>
          <ContextMenuTrigger asChild>
            <div
              className="text-muted-foreground flex w-full items-center gap-2 px-2 py-0.5"
              title={t.name}
            >
              <span className="w-3 shrink-0" aria-hidden />
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 truncate font-mono">
                {highlight(t.name, query)}
              </span>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem
              onSelect={() =>
                onOpenDesigner({
                  mode: "alter-child-tags",
                  connId,
                  db: dbName,
                  targetName: t.name,
                  stableName,
                })
              }
            >
              {tr("resources-panel.context-menu.edit-child-tags")}
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() =>
                onDrop({ kind: "table", connId, db: dbName, name: t.name })
              }
              className="text-destructive focus:text-destructive"
            >
              {tr("resources-panel.context-menu.drop-table")}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ))}
      {state.loading && (
        <p className="text-muted-foreground px-3 py-1 text-[11px]">
          {tr("resources-panel.tree.loading")}
        </p>
      )}
      {remaining > 0 && !state.loading && (
        <button
          type="button"
          onClick={onLoadMore}
          className="text-muted-foreground hover:text-foreground hover:bg-muted/40 w-full px-3 py-1 text-left text-[11px]"
        >
          {tr("resources-panel.tree.load-more", {
            n: CHILD_PAGE_SIZE,
            remaining,
          })}
        </button>
      )}
    </div>
  );
}
