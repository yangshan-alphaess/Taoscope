/**
 * MockDataSource: in-memory implementation of the DataSource contract.
 *
 * Backing fixtures are declared statically below. runSql is "tier A" — it
 * ignores the input SQL and always returns the same demo time-series payload.
 */

import type {
  Column,
  Connection,
  Database,
  DataSource,
  ListTablesOpts,
  Paged,
  QueryResult,
  STable,
  Table,
  TestConnectionResult,
} from "@/datasource/types";

const SCRATCH_KEY_PREFIX = "taoscope.scratch.";

/** Yield to the microtask queue so callers always see real async behavior. */
const tick = () => Promise.resolve();

interface FixtureSchema {
  databases: Database[];
  /** Map of database name -> STables under it. */
  stables: Record<string, STable[]>;
  /** Map of database name -> non-child tables under it. */
  tables: Record<string, Table[]>;
}

const CONNECTIONS: Connection[] = [
  {
    id: "prod-shanghai",
    name: "prod-shanghai",
    host: "192.168.10.20",
    port: 6041,
    user: "root",
    status: "online",
  },
  {
    id: "staging-bj",
    name: "staging-bj",
    host: "10.0.3.15",
    port: 6041,
    user: "dev",
    status: "online",
  },
  {
    id: "dev-local",
    name: "dev-local",
    host: "127.0.0.1",
    port: 6041,
    user: "root",
    status: "offline",
  },
];

const METERS: STable = {
  name: "meters",
  columns: [
    { name: "ts", type: "TIMESTAMP", isPrimaryTs: true },
    { name: "current", type: "FLOAT" },
    { name: "voltage", type: "INT" },
    { name: "phase", type: "FLOAT" },
  ],
  tagColumns: [
    { name: "location", type: "BINARY", length: 64, isTag: true },
    { name: "groupId", type: "INT", isTag: true },
  ],
  childCount: 3847,
};

const DEVICES: STable = {
  name: "devices",
  columns: [
    { name: "ts", type: "TIMESTAMP", isPrimaryTs: true },
    { name: "online", type: "BOOL" },
    { name: "uptime", type: "BIGINT" },
  ],
  tagColumns: [
    { name: "model", type: "NCHAR", length: 32, isTag: true },
    { name: "region", type: "BINARY", length: 32, isTag: true },
  ],
  childCount: 128,
};

const APP_LOGS: STable = {
  name: "app_logs",
  columns: [
    { name: "ts", type: "TIMESTAMP", isPrimaryTs: true },
    { name: "severity", type: "TINYINT" },
    { name: "message", type: "NCHAR", length: 256 },
  ],
  tagColumns: [
    { name: "app_name", type: "BINARY", length: 64, isTag: true },
    { name: "host", type: "BINARY", length: 64, isTag: true },
  ],
  childCount: 12,
};

const ALERTS_TABLE: Table = {
  name: "alerts",
  isChild: false,
};

const ALERTS_COLUMNS: Column[] = [
  { name: "ts", type: "TIMESTAMP", isPrimaryTs: true },
  { name: "level", type: "INT" },
  { name: "code", type: "BINARY", length: 32 },
  { name: "msg", type: "NCHAR", length: 128 },
  { name: "acked", type: "BOOL" },
];

const ONLINE_SCHEMA: FixtureSchema = {
  databases: [
    { name: "iot_db", retention: "14d", vgroups: 4, precision: "ms" },
    { name: "log_db", retention: "7d", vgroups: 2, precision: "ms" },
    { name: "system" },
  ],
  stables: {
    iot_db: [METERS, DEVICES],
    log_db: [APP_LOGS],
    system: [],
  },
  tables: {
    iot_db: [ALERTS_TABLE],
    log_db: [],
    system: [],
  },
};

const STABLE_INDEX: Record<string, STable> = {
  meters: METERS,
  devices: DEVICES,
  app_logs: APP_LOGS,
};

const TABLE_INDEX: Record<string, Column[]> = {
  alerts: ALERTS_COLUMNS,
};

/** Pad an integer with leading zeros, e.g. childName(1) -> 'd_000001'. */
function childName(index: number): string {
  return `d_${String(index).padStart(6, "0")}`;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, digits = 2): number {
  const raw = Math.random() * (max - min) + min;
  return Number(raw.toFixed(digits));
}

const DEMO_LOCATIONS = ["shanghai", "beijing", "guangzhou", "shenzhen"];

const DEMO_QUERY_COLUMNS: Column[] = [
  { name: "ts", type: "TIMESTAMP", isPrimaryTs: true },
  { name: "current", type: "FLOAT" },
  { name: "voltage", type: "INT" },
  { name: "phase", type: "FLOAT" },
  { name: "location", type: "BINARY", length: 64, isTag: true },
  { name: "groupId", type: "INT", isTag: true },
];

function buildDemoRows(): unknown[][] {
  const now = Date.now();
  const rows: unknown[][] = [];
  for (let i = 9; i >= 0; i--) {
    rows.push([
      now - i * 1000,
      randomFloat(8.5, 14.5, 2),
      randomInt(215, 232),
      randomFloat(-0.5, 0.5, 3),
      DEMO_LOCATIONS[i % DEMO_LOCATIONS.length],
      randomInt(1, 5),
    ]);
  }
  return rows;
}

export class MockDataSource implements DataSource {
  async listConnections(): Promise<Connection[]> {
    await tick();
    return CONNECTIONS.map((c) => ({ ...c }));
  }

  async testConnection(connId: string): Promise<TestConnectionResult> {
    await tick();
    const conn = CONNECTIONS.find((c) => c.id === connId);
    if (!conn) {
      return { ok: false, message: `Unknown connection: ${connId}` };
    }
    if (conn.status === "offline") {
      return { ok: false, message: "ECONNREFUSED" };
    }
    return { ok: true };
  }

  async listDatabases(connId: string): Promise<Database[]> {
    await tick();
    const conn = CONNECTIONS.find((c) => c.id === connId);
    if (!conn || conn.status === "offline") return [];
    return ONLINE_SCHEMA.databases.map((d) => ({ ...d }));
  }

  async listSTables(_connId: string, db: string): Promise<STable[]> {
    await tick();
    const list = ONLINE_SCHEMA.stables[db];
    return list ? list.map((s) => ({ ...s })) : [];
  }

  async listTables(
    _connId: string,
    db: string,
    opts: ListTablesOpts,
  ): Promise<Paged<Table>> {
    await tick();
    const { stable, page, pageSize, search } = opts;
    const offset = (page - 1) * pageSize;

    if (stable) {
      const stb = ONLINE_SCHEMA.stables[db]?.find((s) => s.name === stable);
      if (!stb) {
        return { items: [], total: 0, page, pageSize };
      }
      // Generate child table names on demand; filter by `search` if provided.
      if (search) {
        const matches: Table[] = [];
        for (let i = 1; i <= stb.childCount; i++) {
          const name = childName(i);
          if (name.includes(search)) matches.push({
            name,
            isChild: true,
            stableName: stb.name,
          });
        }
        const slice = matches.slice(offset, offset + pageSize);
        return { items: slice, total: matches.length, page, pageSize };
      }
      const items: Table[] = [];
      const start = offset + 1;
      const end = Math.min(stb.childCount, offset + pageSize);
      for (let i = start; i <= end; i++) {
        items.push({ name: childName(i), isChild: true, stableName: stb.name });
      }
      return { items, total: stb.childCount, page, pageSize };
    }

    // No `stable` filter: return non-child tables in the database.
    const all = ONLINE_SCHEMA.tables[db] ?? [];
    const filtered = search
      ? all.filter((t) => t.name.includes(search))
      : all;
    const slice = filtered.slice(offset, offset + pageSize);
    return {
      items: slice.map((t) => ({ ...t })),
      total: filtered.length,
      page,
      pageSize,
    };
  }

  async describeTable(
    _connId: string,
    _db: string,
    table: string,
  ): Promise<Column[]> {
    await tick();
    const stb = STABLE_INDEX[table];
    if (stb) {
      return [...stb.columns, ...stb.tagColumns];
    }
    const cols = TABLE_INDEX[table];
    if (cols) return [...cols];
    // Child table: look up its parent STable by prefix convention.
    if (table.startsWith("d_")) {
      // Without knowing the parent stable, default to meters' shape for the mock.
      return [...METERS.columns, ...METERS.tagColumns];
    }
    return [];
  }

  async runSql(
    _connId: string,
    _db: string | null,
    _sql: string,
  ): Promise<QueryResult> {
    await tick();
    const rows = buildDemoRows();
    return {
      columns: DEMO_QUERY_COLUMNS.map((c) => ({ ...c })),
      rows,
      rowCount: rows.length,
      elapsedMs: randomInt(30, 80),
      truncated: false,
    };
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
}
