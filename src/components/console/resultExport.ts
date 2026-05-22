import type { Column, QueryResult } from "@/datasource/types";

const BOM = "﻿";
const NEEDS_QUOTE = /["\r\n,]/;

export function serializeValue(value: unknown, col: Column): string {
  if (value === null || value === undefined) return "";
  if (col.type === "TIMESTAMP" && typeof value === "number") {
    return new Date(value).toISOString();
  }
  if (col.type === "BOOL") return value ? "true" : "false";
  return String(value);
}

function quoteCsvField(s: string): string {
  if (!NEEDS_QUOTE.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(result: QueryResult): string {
  const header = result.columns.map((c) => quoteCsvField(c.name)).join(",");
  const dataLines = result.rows.map((row) =>
    result.columns
      .map((col, idx) => quoteCsvField(serializeValue(row[idx], col)))
      .join(","),
  );
  return BOM + [header, ...dataLines].join("\r\n");
}

function jsonValue(value: unknown, col: Column): unknown {
  if (value === null || value === undefined) return null;
  if (col.type === "TIMESTAMP" && typeof value === "number") {
    return new Date(value).toISOString();
  }
  return value;
}

export function toJson(result: QueryResult): string {
  const arr = result.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    result.columns.forEach((col, idx) => {
      obj[col.name] = jsonValue(row[idx], col);
    });
    return obj;
  });
  return JSON.stringify(arr, null, 2);
}

export function rowToTsv(row: unknown[], columns: Column[]): string {
  return columns
    .map((col, idx) =>
      serializeValue(row[idx], col).replace(/[\t\r\n]/g, " "),
    )
    .join("\t");
}

export function rowToJson(row: unknown[], columns: Column[]): string {
  const obj: Record<string, unknown> = {};
  columns.forEach((col, idx) => {
    obj[col.name] = jsonValue(row[idx], col);
  });
  return JSON.stringify(obj, null, 2);
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export function buildFilename(ext: "csv" | "json"): string {
  const now = new Date();
  const date = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(
    now.getDate(),
  )}`;
  const time = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(
    now.getSeconds(),
  )}`;
  return `taoscope-result-${date}-${time}.${ext}`;
}
