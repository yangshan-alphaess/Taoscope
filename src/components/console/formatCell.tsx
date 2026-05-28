import type { ReactNode } from "react";
import type { Column } from "@/datasource/types";
import { formatTimestamp } from "@/lib/timezone";
import type { TzPref } from "@/state/displayPrefs";

export function formatCell(
  value: unknown,
  col: Column,
  tz: TzPref = { kind: "utc" },
): ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground/60 italic">NULL</span>;
  }
  switch (col.type) {
    case "TIMESTAMP":
      if (typeof value === "number") {
        return (
          <span className="font-mono">{formatTimestamp(value, tz)}</span>
        );
      }
      return <span className="font-mono">{String(value)}</span>;
    case "BOOL":
      return (
        <span className="font-mono">{value ? "true" : "false"}</span>
      );
    case "INT":
    case "BIGINT":
    case "SMALLINT":
    case "TINYINT":
    case "INT UNSIGNED":
    case "BIGINT UNSIGNED":
    case "SMALLINT UNSIGNED":
    case "TINYINT UNSIGNED":
    case "FLOAT":
    case "DOUBLE":
      return (
        <span className="font-mono tabular-nums">{String(value)}</span>
      );
    default:
      return <span className="font-mono">{String(value)}</span>;
  }
}

export function isNumericColumn(col: Column): boolean {
  return /^(INT|BIGINT|SMALLINT|TINYINT|FLOAT|DOUBLE)( UNSIGNED)?$/.test(
    col.type,
  );
}
