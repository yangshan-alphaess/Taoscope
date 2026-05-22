/**
 * Module-level schema lookup cache used by the SQL autocompletion source.
 *
 * Keyed by connectionId / connectionId|db / connectionId|db|table with a TTL
 * so per-keystroke completion invocations don't hammer the DataSource. Phase 2
 * (real backend) reuses this without changes.
 */

import type {
  Column,
  Database,
  DataSource,
  STable,
  Table,
} from "@/datasource/types";

const TTL_MS = 60_000;
const TABLES_PAGE_SIZE = 200;

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export interface DbContents {
  stables: STable[];
  tables: Table[];
}

export class SchemaCache {
  private databases = new Map<string, Entry<Database[]>>();
  private dbContents = new Map<string, Entry<DbContents>>();
  private tableColumns = new Map<string, Entry<Column[]>>();

  async getDatabases(ds: DataSource, connId: string): Promise<Database[]> {
    const hit = this.databases.get(connId);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
    const value = await ds.listDatabases(connId);
    this.databases.set(connId, { value, expiresAt: Date.now() + TTL_MS });
    return value;
  }

  async getDbContents(
    ds: DataSource,
    connId: string,
    db: string,
  ): Promise<DbContents> {
    const key = `${connId}|${db}`;
    const hit = this.dbContents.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
    const [stables, tablesPage] = await Promise.all([
      ds.listSTables(connId, db),
      ds.listTables(connId, db, { page: 1, pageSize: TABLES_PAGE_SIZE }),
    ]);
    const value: DbContents = { stables, tables: tablesPage.items };
    this.dbContents.set(key, { value, expiresAt: Date.now() + TTL_MS });
    return value;
  }

  async getTableColumns(
    ds: DataSource,
    connId: string,
    db: string,
    table: string,
  ): Promise<Column[]> {
    const key = `${connId}|${db}|${table}`;
    const hit = this.tableColumns.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
    const value = await ds.describeTable(connId, db, table);
    this.tableColumns.set(key, { value, expiresAt: Date.now() + TTL_MS });
    return value;
  }

  invalidate(connId?: string): void {
    if (!connId) {
      this.databases.clear();
      this.dbContents.clear();
      this.tableColumns.clear();
      return;
    }
    this.databases.delete(connId);
    for (const k of this.dbContents.keys()) {
      if (k.startsWith(connId + "|")) this.dbContents.delete(k);
    }
    for (const k of this.tableColumns.keys()) {
      if (k.startsWith(connId + "|")) this.tableColumns.delete(k);
    }
  }
}

export const schemaCache = new SchemaCache();
