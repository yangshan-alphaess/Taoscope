// Pure TDengine DDL generation for the table designer.
//
// All functions are side-effect free (no React/store imports) so they can
// drive both the live SQL preview and execution. Identifiers are always
// backtick-quoted; a length suffix is emitted only for variable-length types.

import type { Column, TdDataType } from "@/datasource/types";

export const VAR_TYPES: readonly TdDataType[] = ["BINARY", "NCHAR", "VARCHAR"];

export function isVarType(type: TdDataType): boolean {
  return VAR_TYPES.includes(type);
}

const NUMERIC_TYPES: readonly TdDataType[] = [
  "INT",
  "BIGINT",
  "SMALLINT",
  "TINYINT",
  "INT UNSIGNED",
  "BIGINT UNSIGNED",
  "SMALLINT UNSIGNED",
  "TINYINT UNSIGNED",
  "FLOAT",
  "DOUBLE",
  "BOOL",
];

export type DropKind = "database" | "stable" | "table";

export interface ColumnDraft {
  name: string;
  type: TdDataType;
  /** Byte length for BINARY/NCHAR/VARCHAR; ignored otherwise. */
  length?: number;
  /** True for tag columns (super tables only). */
  isTag: boolean;
  /** True for the locked primary timestamp column. */
  primaryTs?: boolean;
}

export interface TagValue {
  name: string;
  type: TdDataType;
  value: string;
}

export function quoteIdent(name: string): string {
  return "`" + name.replace(/`/g, "``") + "`";
}

function qualified(db: string, name: string): string {
  return `${quoteIdent(db)}.${quoteIdent(name)}`;
}

function typeWithLen(col: { type: TdDataType; length?: number }): string {
  return isVarType(col.type) && col.length
    ? `${col.type}(${col.length})`
    : col.type;
}

export function columnDef(col: ColumnDraft): string {
  return `${quoteIdent(col.name)} ${typeWithLen(col)}`;
}

export function tagValueLiteral(type: TdDataType, value: string): string {
  if (NUMERIC_TYPES.includes(type)) return value;
  // String / timestamp tags: single-quote and escape embedded quotes.
  return `'${value.replace(/'/g, "\\'")}'`;
}

export function buildCreateDatabase(name: string): string {
  return `CREATE DATABASE IF NOT EXISTS ${quoteIdent(name)}`;
}

export function buildCreateStable(
  db: string,
  name: string,
  columns: ColumnDraft[],
  tags: ColumnDraft[],
): string {
  const cols = columns.map(columnDef).join(", ");
  const tagDefs = tags.map(columnDef).join(", ");
  return `CREATE STABLE ${qualified(db, name)} (${cols}) TAGS (${tagDefs})`;
}

export function buildCreateTable(
  db: string,
  name: string,
  columns: ColumnDraft[],
): string {
  const cols = columns.map(columnDef).join(", ");
  return `CREATE TABLE ${qualified(db, name)} (${cols})`;
}

export function buildCreateChild(
  db: string,
  name: string,
  stable: string,
  tagValues: TagValue[],
): string {
  const tags = tagValues
    .map((tv) => tagValueLiteral(tv.type, tv.value))
    .join(", ");
  return `CREATE TABLE ${qualified(db, name)} USING ${qualified(db, stable)} TAGS (${tags})`;
}

export function buildDrop(kind: DropKind, db: string, name: string): string {
  switch (kind) {
    case "database":
      return `DROP DATABASE ${quoteIdent(name)}`;
    case "stable":
      return `DROP STABLE ${qualified(db, name)}`;
    case "table":
      return `DROP TABLE ${qualified(db, name)}`;
  }
}

export interface AlterTarget {
  db: string;
  name: string;
  isStable: boolean;
}

/**
 * Diffs an existing schema (from describeTable) against an edited draft and
 * returns ordered, single-operation ALTER statements: ADD → MODIFY → DROP.
 * Only variable-length columns whose length increases produce a MODIFY; the
 * primary timestamp column is never altered.
 */
export function diffAlter(
  target: AlterTarget,
  existing: Column[],
  edited: ColumnDraft[],
): string[] {
  const prefix = `ALTER ${target.isStable ? "STABLE" : "TABLE"} ${qualified(
    target.db,
    target.name,
  )}`;
  const existingByName = new Map(existing.map((c) => [c.name, c]));
  const editedByName = new Map(edited.map((c) => [c.name, c]));

  const adds: string[] = [];
  const mods: string[] = [];
  const drops: string[] = [];

  for (const e of edited) {
    const ex = existingByName.get(e.name);
    if (!ex) {
      adds.push(`${prefix} ADD ${e.isTag ? "TAG" : "COLUMN"} ${columnDef(e)}`);
      continue;
    }
    if (
      isVarType(e.type) &&
      e.length != null &&
      ex.length != null &&
      e.length > ex.length
    ) {
      mods.push(
        `${prefix} MODIFY ${e.isTag ? "TAG" : "COLUMN"} ${quoteIdent(
          e.name,
        )} ${typeWithLen(e)}`,
      );
    }
  }

  for (const ex of existing) {
    if (ex.isPrimaryTs) continue;
    if (!editedByName.has(ex.name)) {
      drops.push(
        `${prefix} DROP ${ex.isTag ? "TAG" : "COLUMN"} ${quoteIdent(ex.name)}`,
      );
    }
  }

  return [...adds, ...mods, ...drops];
}

export function buildSetChildTags(
  db: string,
  name: string,
  changed: TagValue[],
): string[] {
  return changed.map(
    (tv) =>
      `ALTER TABLE ${qualified(db, name)} SET TAG ${quoteIdent(
        tv.name,
      )} = ${tagValueLiteral(tv.type, tv.value)}`,
  );
}
