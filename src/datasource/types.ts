/**
 * DataSource interface contract for Taoscope.
 *
 * All UI components access data exclusively through this interface (via
 * `useDataSource()`). Concrete implementations (MockDataSource today,
 * TauriDataSource in Phase 2) are interchangeable without component changes.
 */

export type TdDataType =
  | "TIMESTAMP"
  | "INT"
  | "BIGINT"
  | "SMALLINT"
  | "TINYINT"
  | "INT UNSIGNED"
  | "BIGINT UNSIGNED"
  | "SMALLINT UNSIGNED"
  | "TINYINT UNSIGNED"
  | "FLOAT"
  | "DOUBLE"
  | "BINARY"
  | "NCHAR"
  | "VARCHAR"
  | "JSON"
  | "BOOL";

export interface Column {
  name: string;
  type: TdDataType;
  /** Byte length for BINARY/NCHAR/VARCHAR columns. */
  length?: number;
  /** True if this column is a tag column (STable tags). */
  isTag?: boolean;
  /** True if this column is the primary timestamp column. */
  isPrimaryTs?: boolean;
}

export type AuthMode = "basic" | "token";

export type Protocol = "http" | "https";

export type Transport = "http" | "ws";

export interface Connection {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  password: string;
  /** Optional color label for visual disambiguation between connections. */
  color?: string;
  status: "online" | "offline";
  authMode: AuthMode;
  /** Bearer-style token used when authMode === 'token'. */
  token?: string;
  protocol: Protocol;
  /** Skip TLS certificate validation (only meaningful for https). */
  allowInvalidCerts?: boolean;
  transport: Transport;
  /** Total per-request timeout in milliseconds; undefined = 30s default. */
  timeoutMs?: number;
}

export interface ConnectionInput {
  name: string;
  host: string;
  port: number;
  user: string;
  password: string;
  color?: string;
  authMode: AuthMode;
  token?: string;
  protocol: Protocol;
  allowInvalidCerts?: boolean;
  transport: Transport;
  /** Total per-request timeout in milliseconds; undefined = 30s default. */
  timeoutMs?: number;
}

export interface Database {
  name: string;
  /** Retention as a TDengine duration string, e.g. '7d', '14d'. */
  retention?: string;
  vgroups?: number;
  precision?: "ms" | "us" | "ns";
}

export interface STable {
  name: string;
  /** Non-tag columns. */
  columns: Column[];
  /** Tag columns. */
  tagColumns: Column[];
  /**
   * Total number of child tables. `undefined` until the children pane has
   * been expanded at least once — listing super tables intentionally skips
   * the `COUNT(*)` round-trip so DB refresh stays cheap.
   */
  childCount?: number;
}

export interface Table {
  name: string;
  /** True when this is a child table of some STable. */
  isChild: boolean;
  /** When isChild is true, the parent STable name. */
  stableName?: string;
}

export interface QueryResult {
  columns: Column[];
  rows: unknown[][];
  rowCount: number;
  elapsedMs: number;
  /** True if the result was truncated to enforce a row cap. */
  truncated: boolean;
  /**
   * Affected-row count for write/DDL statements. When present, the result
   * carries no result set (columns/rows empty) and renders as a success
   * banner instead of a grid. Absent for read queries.
   */
  affectedRows?: number;
}

export interface Paged<T> {
  items: T[];
  /**
   * Definite total when known: either the last page came back short (so
   * `offset + items.length` is the truth) or the caller explicitly asked
   * for it. `undefined` means "unknown — the backend skipped the COUNT(*)
   * scan", and the UI should hide the badge until a future page proves
   * the total or the user requests it explicitly.
   */
  total?: number;
  /** 1-based page index. */
  page: number;
  pageSize: number;
}

export interface ListTablesOpts {
  /** Restrict to child tables of a specific STable. */
  stable?: string;
  /** 1-based page index (required). */
  page: number;
  /** Page size (required). */
  pageSize: number;
  /** Substring filter on table name. */
  search?: string;
}

/** Pagination-free filter for the standalone `countTables` call — counts are
 *  taken over the entire matching set, so page/pageSize would be misleading. */
export interface CountTablesOpts {
  stable?: string;
  search?: string;
}

export interface TestConnectionResult {
  ok: boolean;
  message?: string;
}

export interface Console {
  id: string;
  /** Display name; unique within a single connection. */
  name: string;
  /** Connection this console is bound to; immutable after creation. */
  connectionId: string;
  /** Default database for this console; may be null. */
  currentDb: string | null;
  /** Epoch milliseconds at creation. */
  createdAt: number;
}

export interface CreateConsoleInput {
  connectionId: string;
  /** Optional explicit name; if absent, an auto-numbered "Console #N" is used. */
  name?: string;
}

export interface HistoryEntry {
  sql: string;
  runAt: number;
  rowCount: number;
  elapsedMs: number;
  truncated: boolean;
}

export interface DataSource {
  listConnections(): Promise<Connection[]>;
  testConnection(connId: string): Promise<TestConnectionResult>;
  createConnection(input: ConnectionInput): Promise<Connection>;
  updateConnection(id: string, input: ConnectionInput): Promise<void>;
  deleteConnection(id: string): Promise<void>;
  testConnectionConfig(input: ConnectionInput): Promise<TestConnectionResult>;

  listDatabases(connId: string): Promise<Database[]>;
  listSTables(connId: string, db: string): Promise<STable[]>;
  listTables(
    connId: string,
    db: string,
    opts: ListTablesOpts,
  ): Promise<Paged<Table>>;
  /**
   * Run only the `COUNT(*)` query for child / normal tables. Decoupled from
   * `listTables` so the items can render first and the count fills in
   * asynchronously — counting `information_schema.ins_tables` is a full scan
   * and can be slow.
   */
  countTables(
    connId: string,
    db: string,
    opts: CountTablesOpts,
  ): Promise<number>;
  describeTable(connId: string, db: string, table: string): Promise<Column[]>;

  runSql(
    connId: string,
    db: string | null,
    sql: string,
    queryId?: string,
  ): Promise<QueryResult>;
  /** Cancel an in-flight query identified by its `queryId`. Returns true if
   * the query was found and cancelled, false if it had already finished or
   * never registered. */
  cancelQuery(queryId: string): Promise<boolean>;

  loadScratch(consoleId: string): Promise<string>;
  saveScratch(consoleId: string, content: string): Promise<void>;

  // Console workspace
  listConsoles(): Promise<Console[]>;
  createConsole(input: CreateConsoleInput): Promise<Console>;
  renameConsole(id: string, name: string): Promise<void>;
  updateConsoleDb(id: string, db: string | null): Promise<void>;
  deleteConsole(id: string): Promise<void>;
  loadResult(consoleId: string): Promise<QueryResult | null>;
  saveResult(consoleId: string, result: QueryResult): Promise<void>;

  loadHistory(consoleId: string): Promise<HistoryEntry[]>;
  saveHistory(consoleId: string, entries: HistoryEntry[]): Promise<void>;
}
