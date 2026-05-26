import type { QueryResult } from "@/datasource/types";

export const ROW_CAP = 1000;
export const PROBE_LIMIT = 1001;

const LIMIT_PATTERN = /\bLIMIT\s+\d+/i;

// Skip leading whitespace, line comments (`-- ...`), and block comments
// (`/* ... */`) before requiring a word-boundary EXPLAIN. Used by both the
// row-cap short-circuit and the Explain action's prefix detector.
export const EXPLAIN_PATTERN =
  /^\s*(?:\/\*[\s\S]*?\*\/\s*|--[^\n]*\n\s*)*EXPLAIN\b/i;

export function injectRowCapLimit(sql: string): string {
  // EXPLAIN does not accept a LIMIT clause in TDengine; appending one would
  // turn every Explain run into a syntax error.
  if (EXPLAIN_PATTERN.test(sql)) return sql;
  if (LIMIT_PATTERN.test(sql)) return sql;
  const trimmed = sql.replace(/;+\s*$/, "").trimEnd();
  return `${trimmed}\nLIMIT ${PROBE_LIMIT}`;
}

export function ensureExplainPrefix(sql: string): string {
  if (EXPLAIN_PATTERN.test(sql)) return sql;
  return `EXPLAIN ${sql}`;
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
