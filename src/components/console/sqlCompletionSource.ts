/**
 * Schema-aware SQL autocompletion source for CodeMirror.
 *
 * Driven by `detectContext` (heuristic) → `schemaCache` (TTL) → CodeMirror
 * Completion options. Returns null for keyword / none / unsupported context so
 * the keyword source from `@codemirror/lang-sql` can still populate the popup.
 */

import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import type { Column, DataSource } from "@/datasource/types";
import { detectContext, type CursorContext } from "./sqlContext";
import { schemaCache } from "./schemaCache";

interface SourceOpts {
  ds: DataSource;
  getContext: () => { connectionId: string | null; db: string | null };
}

export function createSqlCompletionSource(
  opts: SourceOpts,
): (ctx: CompletionContext) => Promise<CompletionResult | null> {
  return async (ctx) => {
    const doc = ctx.state.doc.toString();
    const detected = detectContext(doc, ctx.pos);
    if (detected.kind === "none" || detected.kind === "keyword") return null;

    const { connectionId, db } = opts.getContext();
    if (!connectionId) return null;

    try {
      switch (detected.kind) {
        case "database":
          return await buildDatabaseCompletions(opts.ds, connectionId, detected);
        case "table":
          return await buildTableCompletions(opts.ds, connectionId, db, detected);
        case "tableColumn":
          return await buildTableColumnCompletions(
            opts.ds,
            connectionId,
            db,
            detected,
          );
        case "column":
          return await buildColumnCompletions(opts.ds, connectionId, db, detected);
      }
    } catch {
      return null;
    }
  };
}

async function buildDatabaseCompletions(
  ds: DataSource,
  connId: string,
  detected: Extract<CursorContext, { kind: "database" }>,
): Promise<CompletionResult | null> {
  const dbs = await schemaCache.getDatabases(ds, connId);
  if (dbs.length === 0) return null;
  const options: Completion[] = dbs.map((d) => ({
    label: d.name,
    type: "namespace",
    detail: `${d.precision ?? "ms"} · ${d.retention ?? "—"}`,
  }));
  return { from: detected.from, options };
}

async function buildTableCompletions(
  ds: DataSource,
  connId: string,
  db: string | null,
  detected: Extract<CursorContext, { kind: "table" }>,
): Promise<CompletionResult | null> {
  if (!db) return null;
  const { stables, tables } = await schemaCache.getDbContents(ds, connId, db);
  const options: Completion[] = [
    ...stables.map<Completion>((s) => ({
      label: s.name,
      type: "class",
      detail: `STable · ${s.childCount}`,
      boost: 5,
    })),
    ...tables.map<Completion>((t) => ({
      label: t.name,
      type: "class",
      detail: t.isChild ? `Child of ${t.stableName ?? "?"}` : "Table",
      boost: t.isChild ? 1 : 3,
    })),
  ];
  if (options.length === 0) return null;
  return { from: detected.from, options };
}

async function buildTableColumnCompletions(
  ds: DataSource,
  connId: string,
  db: string | null,
  detected: Extract<CursorContext, { kind: "tableColumn" }>,
): Promise<CompletionResult | null> {
  if (!db) return null;
  const cols = await schemaCache.getTableColumns(ds, connId, db, detected.table);
  if (cols.length === 0) return null;
  const options: Completion[] = cols.map((c) => columnCompletion(c));
  return { from: detected.from, options };
}

async function buildColumnCompletions(
  ds: DataSource,
  connId: string,
  db: string | null,
  detected: Extract<CursorContext, { kind: "column" }>,
): Promise<CompletionResult | null> {
  if (!db) return null;
  const { stables, tables } = await schemaCache.getDbContents(ds, connId, db);
  const seen = new Map<string, Column>();
  for (const s of stables) {
    for (const c of s.columns) if (!seen.has(c.name)) seen.set(c.name, c);
    for (const c of s.tagColumns) if (!seen.has(c.name)) seen.set(c.name, c);
  }
  // Non-child tables: fetch columns via cache (parallel).
  const tableCols = await Promise.all(
    tables
      .filter((t) => !t.isChild)
      .map((t) => schemaCache.getTableColumns(ds, connId, db, t.name)),
  );
  for (const cols of tableCols) {
    for (const c of cols) if (!seen.has(c.name)) seen.set(c.name, c);
  }
  if (seen.size === 0) return null;
  const options: Completion[] = Array.from(seen.values()).map((c) =>
    columnCompletion(c),
  );
  return { from: detected.from, options };
}

function columnCompletion(c: Column): Completion {
  const lenSuffix = c.length ? `(${c.length})` : "";
  const detail = c.isTag
    ? `${c.type}${lenSuffix} · tag`
    : `${c.type}${lenSuffix}${c.isPrimaryTs ? " · ts" : ""}`;
  return {
    label: c.name,
    type: "property",
    detail,
    boost: c.isTag ? -2 : 0,
  };
}
