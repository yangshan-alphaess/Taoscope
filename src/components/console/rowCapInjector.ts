import type { QueryResult } from "@/datasource/types";

export const ROW_CAP = 1000;
export const PROBE_LIMIT = 1001;

const LIMIT_PATTERN = /\bLIMIT\s+\d+/i;

// Skip leading whitespace, line comments (`-- ...`), and block comments
// (`/* ... */`) before requiring a word-boundary EXPLAIN. Used by both the
// row-cap short-circuit and the Explain action's prefix detector.
export const EXPLAIN_PATTERN =
  /^\s*(?:\/\*[\s\S]*?\*\/\s*|--[^\n]*\n\s*)*EXPLAIN\b/i;

// Same comment/whitespace skip as EXPLAIN_PATTERN, used to read the leading
// statement keyword regardless of leading noise.
const LEADING_NOISE = /^\s*(?:\/\*[\s\S]*?\*\/\s*|--[^\n]*\n\s*)*/;

export function leadingKeyword(sql: string): string {
  const stripped = sql.replace(LEADING_NOISE, "");
  const m = /^[A-Za-z_]+/.exec(stripped);
  return m ? m[0].toUpperCase() : "";
}

export function injectRowCapLimit(sql: string): string {
  // Only SELECT accepts a LIMIT clause in TDengine. Appending one to a write,
  // DDL, SHOW, or DESCRIBE statement turns it into a syntax error, so the cap
  // is injected for SELECT alone. `EXPLAIN SELECT ...` has leading keyword
  // EXPLAIN (not SELECT) and is left unchanged, which is also correct.
  if (leadingKeyword(sql) !== "SELECT") return sql;
  if (LIMIT_PATTERN.test(sql)) return sql;
  const trimmed = sql.replace(/;+\s*$/, "").trimEnd();
  return `${trimmed}\nLIMIT ${PROBE_LIMIT}`;
}

export function isDestructiveStatement(sql: string): boolean {
  const kw = leadingKeyword(sql);
  return kw === "DROP" || kw === "DELETE";
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
