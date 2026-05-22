import type { QueryResult } from "@/datasource/types";

export const ROW_CAP = 1000;
export const PROBE_LIMIT = 1001;

const LIMIT_PATTERN = /\bLIMIT\s+\d+/i;

export function injectRowCapLimit(sql: string): string {
  if (LIMIT_PATTERN.test(sql)) return sql;
  const trimmed = sql.replace(/;+\s*$/, "").trimEnd();
  return `${trimmed}\nLIMIT ${PROBE_LIMIT}`;
}

export function applyRowCap(result: QueryResult): QueryResult {
  if (result.rowCount !== PROBE_LIMIT) return result;
  return {
    ...result,
    rows: result.rows.slice(0, ROW_CAP),
    rowCount: ROW_CAP,
    truncated: true,
  };
}
