import { useEffect, useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
  type SortingFnOption,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronUp } from "lucide-react";

import type { Column, QueryResult } from "@/datasource/types";
import { cn } from "@/lib/utils";
import { formatCell, isNumericColumn } from "@/components/console/formatCell";
import { ResultCell } from "@/components/console/ResultCell";

type Row = unknown[];

function sortingFnForColumn(col: Column): SortingFnOption<Row> {
  switch (col.type) {
    case "TIMESTAMP":
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
      return (a, b, id) => {
        const av = a.getValue(id) as number | null | undefined;
        const bv = b.getValue(id) as number | null | undefined;
        if (av == null) return bv == null ? 0 : -1;
        if (bv == null) return 1;
        return av - bv;
      };
    case "BOOL":
      return (a, b, id) =>
        Number(!!a.getValue(id)) - Number(!!b.getValue(id));
    default:
      return "text";
  }
}

function estimateInitialSize(col: Column): number {
  const headerWidth = col.name.length * 7 + 60;
  const typeWidth = (() => {
    switch (col.type) {
      case "TIMESTAMP":
        return 200;
      case "BOOL":
        return 80;
      case "TINYINT":
      case "SMALLINT":
        return 80;
      case "INT":
      case "INT UNSIGNED":
        return 100;
      case "BIGINT":
      case "BIGINT UNSIGNED":
        return 140;
      case "FLOAT":
      case "DOUBLE":
        return 120;
      case "BINARY":
      case "NCHAR":
      case "VARCHAR":
        return Math.min(320, (col.length ?? 64) * 4);
      default:
        return 160;
    }
  })();
  return Math.max(80, Math.min(320, Math.max(headerWidth, typeWidth)));
}

function buildColumnDefs(columns: Column[]): ColumnDef<Row>[] {
  return columns.map((col, idx) => ({
    id: col.name,
    accessorFn: (row: Row) => row[idx],
    header: () => (
      <div className="flex items-center gap-1">
        <span>{col.name}</span>
        <span className="text-muted-foreground/70 ml-1 font-mono">
          {col.type}
          {col.isTag ? " · tag" : ""}
        </span>
      </div>
    ),
    cell: (info) => formatCell(info.getValue(), col),
    sortingFn: sortingFnForColumn(col),
    size: estimateInitialSize(col),
    minSize: 64,
    maxSize: 600,
  }));
}

export function ResultGrid({ result }: { result: QueryResult }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  useEffect(() => {
    setSorting([]);
    setColumnSizing({});
  }, [result]);

  const columns = useMemo(
    () => buildColumnDefs(result.columns),
    [result.columns],
  );

  const table = useReactTable<Row>({
    data: result.rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    state: { sorting, columnSizing },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
  });

  const parentRef = useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 8,
  });

  const totalWidth = table.getCenterTotalSize();

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <table
        className="border-collapse font-mono text-xs"
        style={{ display: "block", width: totalWidth }}
      >
        <thead
          className="bg-card sticky top-0 z-10"
          style={{ display: "block" }}
        >
          {table.getHeaderGroups().map((headerGroup) => (
            <tr
              key={headerGroup.id}
              style={{ display: "flex", width: totalWidth }}
            >
              {headerGroup.headers.map((header) => {
                const sortDir = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    className="bg-card hover:bg-muted/40 text-foreground border-border relative cursor-pointer border-r border-b px-2 py-1 text-left text-xs font-medium select-none last:border-r-0"
                    style={{
                      width: header.getSize(),
                      flexShrink: 0,
                    }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                      </span>
                      {sortDir === "asc" && (
                        <ChevronUp className="h-3 w-3 shrink-0" />
                      )}
                      {sortDir === "desc" && (
                        <ChevronDown className="h-3 w-3 shrink-0" />
                      )}
                    </div>
                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        "absolute top-0 right-0 h-full w-1 cursor-col-resize touch-none select-none",
                        header.column.getIsResizing()
                          ? "bg-primary"
                          : "hover:bg-primary/40",
                      )}
                    />
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody
          style={{
            display: "block",
            height: rowVirtualizer.getTotalSize(),
            position: "relative",
            width: totalWidth,
          }}
        >
          {rowVirtualizer.getVirtualItems().map((vRow) => {
            const row = rows[vRow.index];
            if (!row) return null;
            return (
              <tr
                key={row.id}
                className="hover:bg-muted/30 border-border/50 border-b"
                style={{
                  display: "flex",
                  position: "absolute",
                  top: 0,
                  left: 0,
                  transform: `translateY(${vRow.start}px)`,
                  height: 28,
                  width: totalWidth,
                }}
              >
                {row.getVisibleCells().map((cell) => {
                  const col = result.columns.find(
                    (c) => c.name === cell.column.id,
                  );
                  const numeric = col ? isNumericColumn(col) : false;
                  return (
                    <ResultCell
                      key={cell.id}
                      cell={cell}
                      col={col}
                      row={row.original}
                      columns={result.columns}
                      numeric={numeric}
                    />
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
