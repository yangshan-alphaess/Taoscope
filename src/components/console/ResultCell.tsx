import { memo, type ReactNode } from "react";

import type { Column } from "@/datasource/types";
import { cn } from "@/lib/utils";

interface ResultCellProps {
  /** Pre-rendered cell content. Computed by the parent so this component
   *  stays a thin presentational wrapper — no hooks, no per-cell context. */
  content: ReactNode;
  col: Column | undefined;
  width: number;
  numeric: boolean;
  colIndex: number;
  /** Captured by the parent row's single ContextMenu when the user right-
   *  clicks anywhere inside the row, so the menu knows which cell it is
   *  acting on. */
  onContextMenuCapture: (colIndex: number) => void;
}

/**
 * One <td>. Deliberately stateless + memoized: the perf bottleneck in
 * the grid is the sheer number of cells that mount/unmount as the
 * virtualizer scrolls, so anything per-cell that we can move up to the
 * row (or remove entirely — like the old per-cell ContextMenu) is
 * pure win.
 */
export const ResultCell = memo(function ResultCell({
  content,
  width,
  numeric,
  colIndex,
  onContextMenuCapture,
}: ResultCellProps) {
  return (
    <td
      data-col-index={colIndex}
      onContextMenu={() => onContextMenuCapture(colIndex)}
      className={cn(
        "border-border/30 flex items-center overflow-hidden border-r px-2 text-xs whitespace-nowrap last:border-r-0",
        numeric && "justify-end text-right tabular-nums",
      )}
      style={{ width, flexShrink: 0 }}
    >
      <span className="overflow-hidden text-ellipsis">{content}</span>
    </td>
  );
});
