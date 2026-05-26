import type { Cell } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

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

function previewValue(s: string): string {
  if (s === "") return "";
  if (s.length > 30) return `${s.slice(0, 30)}…`;
  return s;
}

export function ResultCell({
  cell,
  col,
  row,
  columns,
  numeric,
}: ResultCellProps) {
  const { t } = useTranslation("result");
  const value = cell.getValue();

  function copyWithToast(text: string, successLabel: string): void {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(successLabel))
      .catch(() => toast.error(t("toast.failed-to-copy")));
  }

  function handleCopyValue() {
    const text = col ? serializeValue(value, col) : String(value ?? "");
    const preview = previewValue(text);
    const label =
      preview === ""
        ? t("toast.copied-empty")
        : t("toast.copied-quoted", { value: preview });
    copyWithToast(text, label);
  }

  function handleCopyTsv() {
    copyWithToast(rowToTsv(row, columns), t("toast.copied-row"));
  }

  function handleCopyJson() {
    copyWithToast(rowToJson(row, columns), t("toast.copied-row-json"));
  }

  function handleCopyColumnName() {
    if (!col) return;
    copyWithToast(col.name, t("toast.copied-quoted", { value: col.name }));
  }

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
        <ContextMenuItem onSelect={handleCopyValue}>
          {t("context-menu.copy-value")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleCopyTsv}>
          {t("context-menu.copy-row-tsv")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleCopyJson}>
          {t("context-menu.copy-row-json")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={handleCopyColumnName} disabled={!col}>
          {t("context-menu.copy-column-name")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
