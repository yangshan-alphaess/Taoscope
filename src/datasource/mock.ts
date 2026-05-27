/**
 * MockDataSource: browser-only fallback implementation of the DataSource
 * contract. Used under `pnpm dev` when no Tauri runtime is present.
 *
 * Contains no seed connections and no schema fixtures: schema/query methods
 * resolve to empty payloads. The class still preserves localStorage-backed
 * persistence for whatever the user creates at runtime (connections, consoles,
 * scratch, result, history) so the dev path can exercise the full UI.
 */

import { nanoid } from "nanoid";
import type {
  Column,
  Connection,
  ConnectionInput,
  Console,
  CreateConsoleInput,
  Database,
  DataSource,
  HistoryEntry,
  ListTablesOpts,
  Paged,
  QueryResult,
  STable,
  Table,
  TestConnectionResult,
} from "@/datasource/types";

const SCRATCH_KEY_PREFIX = "taoscope.scratch.";
const CONSOLES_KEY = "taoscope.consoles";
const RESULT_KEY_PREFIX = "taoscope.result.";
const CONNECTIONS_KEY = "taoscope.connections";
const HISTORY_KEY_PREFIX = "taoscope.history.";

/** Yield to the microtask queue so callers always see real async behavior. */
const tick = () => Promise.resolve();

const EMPTY_QUERY_RESULT: QueryResult = {
  columns: [],
  rows: [],
  rowCount: 0,
  elapsedMs: 0,
  truncated: false,
};

const WRITE_KEYWORDS = new Set([
  "INSERT",
  "CREATE",
  "ALTER",
  "DROP",
  "DELETE",
  "USE",
]);

function mockLeadingKeyword(sql: string): string {
  const stripped = sql.replace(/^\s*(?:\/\*[\s\S]*?\*\/\s*|--[^\n]*\n\s*)*/, "");
  const m = /^[A-Za-z_]+/.exec(stripped);
  return m ? m[0].toUpperCase() : "";
}

// Dev path: write/DDL statements return an affectedRows banner instead of a
// grid, mirroring the Rust backend's affected-rows detection.
function mockRunResult(sql: string): QueryResult {
  const kw = mockLeadingKeyword(sql);
  if (WRITE_KEYWORDS.has(kw)) {
    const affectedRows = kw === "INSERT" || kw === "DELETE" ? 1 : 0;
    return { ...EMPTY_QUERY_RESULT, affectedRows };
  }
  return { ...EMPTY_QUERY_RESULT };
}

function loadConnectionsFromStorage(): Connection[] {
  try {
    const raw = localStorage.getItem(CONNECTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.every(
      (c) =>
        typeof c === "object" &&
        c !== null &&
        typeof c.id === "string" &&
        typeof c.name === "string" &&
        typeof c.host === "string",
    );
    if (!valid) return [];
    // Backfill new fields for pre-existing localStorage entries.
    return (parsed as Array<Partial<Connection> & Connection>).map((c) => ({
      ...c,
      authMode: c.authMode ?? "basic",
      protocol: c.protocol ?? "http",
      transport: c.transport ?? "http",
      timeoutMs: c.timeoutMs,
    }));
  } catch {
    return [];
  }
}

function persistConnections(list: Connection[]): void {
  try {
    localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

function isLanHost(host: string): boolean {
  return (
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    host === "127.0.0.1" ||
    host === "localhost"
  );
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export class MockDataSource implements DataSource {
  private _connections: Connection[];

  constructor() {
    this._connections = loadConnectionsFromStorage();
  }

  private persist(): void {
    persistConnections(this._connections);
  }

  async listConnections(): Promise<Connection[]> {
    await tick();
    return this._connections.map((c) => ({ ...c }));
  }

  async testConnection(connId: string): Promise<TestConnectionResult> {
    await tick();
    const conn = this._connections.find((c) => c.id === connId);
    if (!conn) {
      return { ok: false, message: `Unknown connection: ${connId}` };
    }
    if (conn.status === "offline") {
      return { ok: false, message: "ECONNREFUSED" };
    }
    return { ok: true };
  }

  async createConnection(input: ConnectionInput): Promise<Connection> {
    await tick();
    const name = input.name.trim();
    if (this._connections.some((c) => c.name === name)) {
      throw new Error("Connection name already exists");
    }
    if (input.authMode === "token" && (input.token ?? "").length === 0) {
      throw new Error("Token is required when authMode='token'");
    }
    const created: Connection = {
      id: nanoid(),
      name,
      host: input.host,
      port: input.port,
      user: input.user,
      password: input.password,
      color: input.color,
      status: "online",
      authMode: input.authMode,
      token: input.token,
      protocol: input.protocol,
      allowInvalidCerts: input.allowInvalidCerts,
      transport: input.transport,
      timeoutMs: input.timeoutMs,
    };
    this._connections.push(created);
    this.persist();
    return { ...created };
  }

  async updateConnection(id: string, input: ConnectionInput): Promise<void> {
    await tick();
    const idx = this._connections.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error(`Connection not found: ${id}`);
    const name = input.name.trim();
    if (this._connections.some((c) => c.id !== id && c.name === name)) {
      throw new Error("Connection name already exists");
    }
    const prev = this._connections[idx]!;
    // Empty password / token = "keep current"; matches Rust state.rs.
    const nextPassword =
      input.password.length === 0 ? prev.password : input.password;
    const nextToken =
      input.token === undefined || input.token.length === 0
        ? prev.token
        : input.token;
    if (
      input.authMode === "token" &&
      (nextToken === undefined || nextToken.length === 0)
    ) {
      throw new Error("Token is required when authMode='token'");
    }
    this._connections[idx] = {
      ...prev,
      name,
      host: input.host,
      port: input.port,
      user: input.user,
      password: nextPassword,
      color: input.color,
      authMode: input.authMode,
      token: nextToken,
      protocol: input.protocol,
      allowInvalidCerts: input.allowInvalidCerts,
      transport: input.transport,
      timeoutMs: input.timeoutMs,
    };
    this.persist();
  }

  async deleteConnection(id: string): Promise<void> {
    await tick();
    const next = this._connections.filter((c) => c.id !== id);
    if (next.length === this._connections.length) return;
    this._connections = next;
    this.persist();

    // Cascade: drop consoles bound to this connection plus their scratch /
    // result / history, mirroring the Rust Store::delete_connection.
    const consoles = loadAllConsoles();
    const orphaned = consoles.filter((c) => c.connectionId === id);
    if (orphaned.length > 0) {
      persistAllConsoles(consoles.filter((c) => c.connectionId !== id));
      try {
        for (const c of orphaned) {
          localStorage.removeItem(SCRATCH_KEY_PREFIX + c.id);
          localStorage.removeItem(RESULT_KEY_PREFIX + c.id);
          localStorage.removeItem(HISTORY_KEY_PREFIX + c.id);
        }
      } catch {
        // ignore
      }
    }
  }

  async testConnectionConfig(
    input: ConnectionInput,
  ): Promise<TestConnectionResult> {
    const delay = randomInt(300, 800);
    await new Promise((resolve) => setTimeout(resolve, delay));
    const host = input.host.trim();
    if (host === "" || input.port < 1 || input.port > 65535) {
      return { ok: false, message: "Invalid host or port" };
    }
    if (input.authMode === "token") {
      const token = (input.token ?? "").trim();
      if (token.length < 8) {
        return { ok: false, message: "token too short" };
      }
      return { ok: true, message: "TDengine 3.x (mock token mode)" };
    }
    if (isLanHost(host)) {
      if (Math.random() < 0.5) {
        return { ok: false, message: "ECONNREFUSED (mock LAN intermittent)" };
      }
      return { ok: true };
    }
    return { ok: true };
  }

  async listDatabases(_connId: string): Promise<Database[]> {
    await tick();
    return [];
  }

  async listSTables(_connId: string, _db: string): Promise<STable[]> {
    await tick();
    return [];
  }

  async listTables(
    _connId: string,
    _db: string,
    opts: ListTablesOpts,
  ): Promise<Paged<Table>> {
    await tick();
    return { items: [], total: 0, page: opts.page, pageSize: opts.pageSize };
  }

  async describeTable(
    _connId: string,
    _db: string,
    _table: string,
  ): Promise<Column[]> {
    await tick();
    return [];
  }

  /** Map of in-flight mock query IDs → cancel handlers. */
  private pending = new Map<string, () => void>();

  async runSql(
    _connId: string,
    _db: string | null,
    sql: string,
    queryId?: string,
  ): Promise<QueryResult> {
    const id = queryId ?? nanoid();
    // Simulate cancellable async query: long-running SQL strings starting
    // with `LONG_` resolve after 5s so cancel can be exercised in dev.
    const delay = sql.startsWith("LONG_") ? 5000 : 0;
    return new Promise<QueryResult>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finalize = (val: QueryResult) => {
        if (this.pending.delete(id) && timer !== null) clearTimeout(timer);
        resolve(val);
      };
      this.pending.set(id, () => {
        if (timer !== null) clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error("Query cancelled"));
      });
      const result = mockRunResult(sql);
      if (delay === 0) {
        finalize(result);
      } else {
        timer = setTimeout(() => {
          finalize(result);
        }, delay);
      }
    });
  }

  async cancelQuery(queryId: string): Promise<boolean> {
    const cancel = this.pending.get(queryId);
    if (!cancel) return false;
    cancel();
    return true;
  }

  async loadScratch(consoleId: string): Promise<string> {
    await tick();
    try {
      return localStorage.getItem(SCRATCH_KEY_PREFIX + consoleId) ?? "";
    } catch {
      return "";
    }
  }

  async saveScratch(consoleId: string, content: string): Promise<void> {
    await tick();
    try {
      localStorage.setItem(SCRATCH_KEY_PREFIX + consoleId, content);
    } catch {
      // Storage may be unavailable (e.g. SSR / private mode); ignore silently.
    }
  }

  // ── Console workspace ──────────────────────────────────────────────────

  async listConsoles(): Promise<Console[]> {
    await tick();
    return loadAllConsoles().map((c) => ({ ...c }));
  }

  async createConsole(input: CreateConsoleInput): Promise<Console> {
    await tick();
    const list = loadAllConsoles();
    const name = input.name ?? autoNextName(list, input.connectionId);
    const created: Console = {
      id: nanoid(),
      name,
      connectionId: input.connectionId,
      currentDb: null,
      createdAt: Date.now(),
    };
    list.push(created);
    persistAllConsoles(list);
    return { ...created };
  }

  async renameConsole(id: string, name: string): Promise<void> {
    await tick();
    const list = loadAllConsoles();
    const target = list.find((c) => c.id === id);
    if (!target) throw new Error(`Console not found: ${id}`);
    if (target.name === name) {
      return;
    }
    const clash = list.find(
      (c) =>
        c.id !== id &&
        c.connectionId === target.connectionId &&
        c.name === name,
    );
    if (clash) {
      throw new Error("Console name already exists");
    }
    target.name = name;
    persistAllConsoles(list);
  }

  async updateConsoleDb(id: string, db: string | null): Promise<void> {
    await tick();
    const list = loadAllConsoles();
    const target = list.find((c) => c.id === id);
    if (!target) throw new Error(`Console not found: ${id}`);
    target.currentDb = db;
    persistAllConsoles(list);
  }

  async deleteConsole(id: string): Promise<void> {
    await tick();
    const list = loadAllConsoles();
    const next = list.filter((c) => c.id !== id);
    persistAllConsoles(next);
    try {
      localStorage.removeItem(SCRATCH_KEY_PREFIX + id);
      localStorage.removeItem(RESULT_KEY_PREFIX + id);
      localStorage.removeItem(HISTORY_KEY_PREFIX + id);
    } catch {
      // ignore
    }
  }

  async loadResult(consoleId: string): Promise<QueryResult | null> {
    await tick();
    try {
      const raw = localStorage.getItem(RESULT_KEY_PREFIX + consoleId);
      if (!raw) return null;
      return JSON.parse(raw) as QueryResult;
    } catch {
      return null;
    }
  }

  async saveResult(consoleId: string, result: QueryResult): Promise<void> {
    await tick();
    try {
      localStorage.setItem(RESULT_KEY_PREFIX + consoleId, JSON.stringify(result));
    } catch {
      // ignore
    }
  }

  async loadHistory(consoleId: string): Promise<HistoryEntry[]> {
    await tick();
    try {
      const raw = localStorage.getItem(HISTORY_KEY_PREFIX + consoleId);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
    } catch {
      return [];
    }
  }

  async saveHistory(
    consoleId: string,
    entries: HistoryEntry[],
  ): Promise<void> {
    await tick();
    try {
      localStorage.setItem(
        HISTORY_KEY_PREFIX + consoleId,
        JSON.stringify(entries),
      );
    } catch {
      // ignore
    }
  }
}

// ── Console list persistence helpers (file-private) ─────────────────────

function loadAllConsoles(): Console[] {
  try {
    const raw = localStorage.getItem(CONSOLES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Console[];
  } catch {
    return [];
  }
}

function persistAllConsoles(list: Console[]): void {
  try {
    localStorage.setItem(CONSOLES_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

const AUTO_NAME_RE = /^Console #(\d+)$/;

function autoNextName(list: Console[], connectionId: string): string {
  let max = 0;
  for (const c of list) {
    if (c.connectionId !== connectionId) continue;
    const m = AUTO_NAME_RE.exec(c.name);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `Console #${max + 1}`;
}
