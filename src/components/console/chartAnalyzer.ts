/**
 * Heuristic Y-axis candidate detection for the chart view.
 *
 * Runs over the in-memory QueryResult — no IPC. Designed to never throw:
 * any unexpected shape falls back to a type-only filter so the popover
 * always shows *something* sensible. Used to pick a default-checked
 * column (the one most likely to be a business metric) and to surface
 * the full candidate list for manual multi-select.
 */
import type { Column, QueryResult, TdDataType } from "@/datasource/types";

export interface YCandidate {
  column: Column;
  /** Higher = more likely to be a business metric. Only relative ordering matters. */
  score: number;
  /** Number of rows that yielded a finite numeric value. */
  nonNullCount: number;
}

// Hard-excluded by type even if values would parse as numbers — these
// types are never useful as a Y-metric line series.
const EXCLUDED_TYPES: ReadonlySet<TdDataType> = new Set<TdDataType>([
  "TIMESTAMP",
  "BOOL",
  "JSON",
]);

const FLOATY: ReadonlySet<TdDataType> = new Set<TdDataType>(["FLOAT", "DOUBLE"]);
const INTEGRAL: ReadonlySet<TdDataType> = new Set<TdDataType>([
  "INT",
  "BIGINT",
  "SMALLINT",
  "TINYINT",
  "INT UNSIGNED",
  "BIGINT UNSIGNED",
  "SMALLINT UNSIGNED",
  "TINYINT UNSIGNED",
]);

// Name hints. Positive list = common business-metric words. Negative
// list = identifier-like names that should NOT be the default.
const POSITIVE_NAME = new RegExp(
  [
    "temp", "humid", "press", "volt", "amp", "current", "power", "energy",
    "speed", "freq", "load", "cpu", "mem", "disk", "io", "net",
    "rate", "ratio", "percent", "usage", "level", "score",
    "count", "qty", "amount", "total", "sum", "avg", "max", "min",
    "value", "metric", "reading", "sample", "signal",
    "lat", "lng", "alt", "rpm", "torque", "flow", "ph",
  ].join("|"),
  "i",
);

const NEGATIVE_NAME = /^(id|seq|idx|index|key|uuid|hash|tbname|tag_)/i;

/**
 * Coerce a single cell value to a finite number, or null if it cannot
 * be — accepting numeric strings (BIGINTs often arrive serialized as
 * strings) but rejecting anything else (booleans, objects, NaN, or
 * date-looking strings — those should go through `coerceTime` instead
 * so we don't accidentally promote a timestamp column to a Y metric).
 */
export function coerceNumeric(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "bigint") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed.length === 0) return null;
    // Number("") is 0, Number(" ") is 0 — already guarded above.
    // Number("abc") is NaN → fails finiteness check.
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Coerce a cell value into an epoch-ms timestamp. Used for the chart's X
 * axis. Looser than `coerceNumeric`: accepts ISO-8601 / RFC-3339 strings
 * via `Date.parse`, which is what the TDengine REST transport actually
 * returns for TIMESTAMP columns (e.g. "2025-10-16T09:21:10.000+08:00").
 */
export function coerceTime(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "bigint") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed.length === 0) return null;
    // Pure-digit strings are epoch numbers (possibly BIGINT-sized).
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : null;
    }
    // Fall through to Date.parse for ISO-ish forms. NaN → null.
    const t = Date.parse(trimmed);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function scoreCandidate(
  col: Column,
  nonNullCount: number,
  totalRows: number,
  min: number,
  max: number,
): number {
  let score = 0;
  if (FLOATY.has(col.type)) score += 3;
  else if (INTEGRAL.has(col.type)) score += 1;
  // String-typed columns whose values all parse as numbers get a small
  // bonus over flat zero — they're plot-able, just not the obvious pick.
  else score += 0;

  if (Number.isFinite(min) && Number.isFinite(max)) {
    if (min === max) score -= 2;
    else score += 2;
  }

  if (totalRows > 0 && nonNullCount / totalRows > 0.8) score += 1;

  const name = col.name;
  if (NEGATIVE_NAME.test(name)) score -= 3;
  if (POSITIVE_NAME.test(name)) score += 2;

  return score;
}

/**
 * Walk the result columns and return the ones that:
 *   - aren't the primary timestamp or a tag,
 *   - aren't one of EXCLUDED_TYPES,
 *   - have at least one non-null value, and
 *   - every non-null value coerces to a finite number (string or numeric).
 *
 * Sorted by descending score so the first entry is the best default pick.
 * Wraps the whole body in try/catch — on failure we degrade to a type-only
 * filter so the UI still works without throwing.
 */
export function analyzeYCandidates(result: QueryResult): YCandidate[] {
  try {
    const totalRows = result.rows.length;
    const out: YCandidate[] = [];
    for (let ci = 0; ci < result.columns.length; ci++) {
      const col = result.columns[ci];
      if (!col) continue;
      if (col.isPrimaryTs) continue;
      if (col.isTag) continue;
      if (EXCLUDED_TYPES.has(col.type)) continue;

      let nonNull = 0;
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      let rejected = false;
      for (const row of result.rows) {
        const v = row[ci];
        if (v == null) continue;
        const n = coerceNumeric(v);
        if (n === null) {
          // A non-null value that doesn't parse as a number disqualifies
          // the column — we want pure number-or-null series.
          rejected = true;
          break;
        }
        nonNull++;
        if (n < min) min = n;
        if (n > max) max = n;
      }
      if (rejected) continue;
      if (nonNull === 0) continue;

      out.push({
        column: col,
        score: scoreCandidate(col, nonNull, totalRows, min, max),
        nonNullCount: nonNull,
      });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  } catch {
    // Degrade gracefully: just hand back numeric-typed columns by metadata.
    return result.columns
      .filter(
        (c) =>
          !!c &&
          !c.isPrimaryTs &&
          !c.isTag &&
          !EXCLUDED_TYPES.has(c.type) &&
          (FLOATY.has(c.type) || INTEGRAL.has(c.type)),
      )
      .map((c) => ({ column: c, score: 0, nonNullCount: 0 }));
  }
}

/**
 * Build (x, y) pairs for a single Y series. X uses `coerceTime` (so ISO
 * date strings from the REST transport are accepted), Y uses
 * `coerceNumeric`. Rows where either side fails are dropped so echarts
 * won't get NaN gaps. Sorted ascending by X so the line is drawn
 * left-to-right regardless of the original row order.
 */
export function buildSeriesPoints(
  result: QueryResult,
  xColName: string,
  yColName: string,
): Array<[number, number]> {
  const xIdx = result.columns.findIndex((c) => c.name === xColName);
  const yIdx = result.columns.findIndex((c) => c.name === yColName);
  if (xIdx < 0 || yIdx < 0) return [];
  const pts: Array<[number, number]> = [];
  for (const row of result.rows) {
    const x = coerceTime(row[xIdx]);
    const y = coerceNumeric(row[yIdx]);
    if (x === null || y === null) continue;
    pts.push([x, y]);
  }
  pts.sort((a, b) => a[0] - b[0]);
  return pts;
}
