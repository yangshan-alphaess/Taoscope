import { invoke } from "@tauri-apps/api/core";

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
} from "./types";

export class TauriDataSource implements DataSource {
  async listConnections(): Promise<Connection[]> {
    return invoke<Connection[]>("list_connections");
  }

  async testConnection(connId: string): Promise<TestConnectionResult> {
    return invoke<TestConnectionResult>("test_connection", { connId });
  }

  async createConnection(input: ConnectionInput): Promise<Connection> {
    return invoke<Connection>("create_connection", { input });
  }

  async updateConnection(id: string, input: ConnectionInput): Promise<void> {
    return invoke<void>("update_connection", { id, input });
  }

  async deleteConnection(id: string): Promise<void> {
    return invoke<void>("delete_connection", { id });
  }

  async testConnectionConfig(
    input: ConnectionInput,
  ): Promise<TestConnectionResult> {
    return invoke<TestConnectionResult>("test_connection_config", { input });
  }

  async listDatabases(connId: string): Promise<Database[]> {
    return invoke<Database[]>("list_databases", { connId });
  }

  async listSTables(connId: string, db: string): Promise<STable[]> {
    return invoke<STable[]>("list_stables", { connId, db });
  }

  async listTables(
    connId: string,
    db: string,
    opts: ListTablesOpts,
  ): Promise<Paged<Table>> {
    return invoke<Paged<Table>>("list_tables", { connId, db, opts });
  }

  async describeTable(
    connId: string,
    db: string,
    table: string,
  ): Promise<Column[]> {
    return invoke<Column[]>("describe_table", { connId, db, table });
  }

  async runSql(
    connId: string,
    db: string | null,
    sql: string,
    queryId: string = crypto.randomUUID(),
  ): Promise<QueryResult> {
    return invoke<QueryResult>("run_sql", { connId, db, sql, queryId });
  }

  async cancelQuery(queryId: string): Promise<boolean> {
    return invoke<boolean>("cancel_query", { queryId });
  }

  async loadScratch(consoleId: string): Promise<string> {
    return invoke<string>("load_scratch", { consoleId });
  }

  async saveScratch(consoleId: string, content: string): Promise<void> {
    return invoke<void>("save_scratch", { consoleId, content });
  }

  async listConsoles(): Promise<Console[]> {
    return invoke<Console[]>("list_consoles");
  }

  async createConsole(input: CreateConsoleInput): Promise<Console> {
    return invoke<Console>("create_console", { input });
  }

  async renameConsole(id: string, name: string): Promise<void> {
    return invoke<void>("rename_console", { id, name });
  }

  async updateConsoleDb(id: string, db: string | null): Promise<void> {
    return invoke<void>("update_console_db", { id, db });
  }

  async deleteConsole(id: string): Promise<void> {
    return invoke<void>("delete_console", { id });
  }

  async loadResult(consoleId: string): Promise<QueryResult | null> {
    return invoke<QueryResult | null>("load_result", { consoleId });
  }

  async saveResult(consoleId: string, result: QueryResult): Promise<void> {
    return invoke<void>("save_result", { consoleId, result });
  }

  async loadHistory(consoleId: string): Promise<HistoryEntry[]> {
    return invoke<HistoryEntry[]>("load_history", { consoleId });
  }

  async saveHistory(
    consoleId: string,
    entries: HistoryEntry[],
  ): Promise<void> {
    return invoke<void>("save_history", { consoleId, entries });
  }
}
