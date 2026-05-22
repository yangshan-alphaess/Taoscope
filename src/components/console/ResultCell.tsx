import type { Cell } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";

import type { Column } from "@/datasource/types";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  rowToJson,
  rowToTsv,
  serializeValue,
} from "@/components/console/resultExport";

type Row = unknown[];

interface ResultCellProps {
  cell: Cell<Row, unknown>;
  col: Column | undefined;
  row: Row;
  columns: Column[];
  numeric: boolean;
}

function writeClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(() => {});
}

export function ResultCell({
  cell,
  col,
  row,
  columns,
  numeric,
}: ResultCellProps) {
  const value = cell.getValue();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <td
          className={cn(
            "border-border/30 flex items-center overflow-hidden border-r px-2 text-xs whitespace-nowrap last:border-r-0",
            numeric && "justify-end text-right tabular-nums",
          )}
          style={{
            width: cell.column.getSize(),
            flexShrink: 0,
          }}
        >
          <span className="overflow-hidden text-ellipsis">
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </span>
        </td>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onSelect={() =>
            writeClipboard(col ? serializeValue(value, col) : String(value ?? ""))
          }
        >
          Copy value
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => writeClipboard(rowToTsv(row, columns))}
        >
          Copy row as TSV
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => writeClipboard(rowToJson(row, columns))}
        >
          Copy row as JSON
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => writeClipboard(col?.name ?? "")}
          disabled={!col}
        >
          Copy column name
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
