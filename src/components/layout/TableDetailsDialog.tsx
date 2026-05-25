import { useEffect, useState } from "react";
import { FileText, Layers } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Column, Table } from "@/datasource/types";
import { cn } from "@/lib/utils";

export type ColumnsState = Column[] | "loading" | "error";

export interface ChildLoadState {
  items: Table[];
  total: number;
  nextPage: number;
  loading: boolean;
  error: string | null;
}

export interface DetailsTarget {
  connId: string;
  db: string;
  table: string;
  isStable: boolean;
  childCount?: number;
}

interface Props {
  target: DetailsTarget | null;
  onClose: () => void;
  columnsByTable: Record<string, ColumnsState>;
  childrenByStable: Record<string, ChildLoadState>;
  onRequestColumns: (connId: string, db: string, table: string) => void;
  onRequestChildren: (connId: string, db: string, stable: string) => void;
  onLoadMoreChildren: (connId: string, db: string, stable: string) => void;
}

type View = "columns" | "children";

export function TableDetailsDialog({
  target,
  onClose,
  columnsByTable,
  childrenByStable,
  onRequestColumns,
  onRequestChildren,
  onLoadMoreChildren,
}: Props) {
  const [view, setView] = useState<View>("columns");

  // Reset to columns view + kick off a load every time the target changes.
  // The parent's loader is idempotent (no-op when already cached), so this
  // is cheap on re-open.
  useEffect(() => {
    if (!target) return;
    setView("columns");
    onRequestColumns(target.connId, target.db, target.table);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.connId, target?.db, target?.table]);

  if (!target) return null;

  const key = `${target.connId}|${target.db}|${target.table}`;
  const cols = columnsByTable[key];
  const childState = target.isStable ? childrenByStable[key] : undefined;

  function switchTo(next: View) {
    setView(next);
    if (next === "children" && target?.isStable) {
      onRequestChildren(target.connId, target.db, target.table);
    }
  }

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            {target.isStable ? (
              <Layers className="text-primary h-4 w-4" />
            ) : (
              <FileText className="text-primary h-4 w-4" />
            )}
            <span className="font-mono">{target.table}</span>
            <span className="text-muted-foreground text-xs font-normal">
              in {target.db}
              {target.isStable && ` · STable · ${target.childCount ?? 0} child`}
            </span>
          </DialogTitle>
        </DialogHeader>

        {target.isStable && (
          <div className="border-border -mx-6 flex border-b px-6">
            <TabButton
              active={view === "columns"}
              onClick={() => switchTo("columns")}
            >
              Columns & tags
            </TabButton>
            <TabButton
              active={view === "children"}
              onClick={() => switchTo("children")}
            >
              Child tables
            </TabButton>
          </div>
        )}

        <div className="max-h-[420px] overflow-y-auto">
          {view === "columns" ? (
            <ColumnsView state={cols} />
          ) : (
            <ChildrenView
              state={childState}
              onLoadMore={() =>
                onLoadMoreChildren(target.connId, target.db, target.table)
              }
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-b-2 px-3 py-2 text-xs transition-colors",
        active
          ? "border-primary text-foreground"
          : "text-muted-foreground hover:text-foreground border-transparent",
      )}
    >
      {children}
    </button>
  );
}

function ColumnsView({ state }: { state: ColumnsState | undefined }) {
  if (!state || state === "loading") {
    return (
      <p className="text-muted-foreground px-4 py-6 text-xs">Loading…</p>
    );
  }
  if (state === "error") {
    return (
      <p className="text-destructive px-4 py-6 text-xs">
        Failed to load columns.
      </p>
    );
  }
  if (state.length === 0) {
    return (
      <p className="text-muted-foreground px-4 py-6 text-xs italic">
        No columns.
      </p>
    );
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-muted-foreground border-border border-b text-left">
          <th className="px-2 py-1.5 font-medium">Field</th>
          <th className="px-2 py-1.5 font-medium">Type</th>
          <th className="px-2 py-1.5 font-medium">Note</th>
        </tr>
      </thead>
      <tbody>
        {state.map((c) => (
          <tr key={c.name} className="border-border/40 border-b">
            <td className="px-2 py-1 font-mono">{c.name}</td>
            <td className="text-muted-foreground px-2 py-1 font-mono">
              {c.type}
              {c.length ? `(${c.length})` : ""}
            </td>
            <td className="text-muted-foreground px-2 py-1">
              {c.isPrimaryTs ? "primary ts" : c.isTag ? "tag" : ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ChildrenView({
  state,
  onLoadMore,
}: {
  state: ChildLoadState | undefined;
  onLoadMore: () => void;
}) {
  if (!state) {
    return (
      <p className="text-muted-foreground px-4 py-6 text-xs">Loading…</p>
    );
  }
  if (state.error && state.items.length === 0) {
    return (
      <div className="px-4 py-6">
        <p className="text-destructive text-xs">{state.error}</p>
        <button
          type="button"
          onClick={onLoadMore}
          className="text-muted-foreground hover:text-foreground mt-2 text-xs underline"
        >
          Retry
        </button>
      </div>
    );
  }
  if (state.items.length === 0 && !state.loading) {
    return (
      <p className="text-muted-foreground px-4 py-6 text-xs italic">
        No child tables.
      </p>
    );
  }
  const remaining = state.total - state.items.length;
  return (
    <div className="text-xs">
      {state.items.map((t) => (
        <div
          key={t.name}
          className="border-border/40 border-b px-3 py-1 font-mono"
        >
          {t.name}
        </div>
      ))}
      {state.loading && (
        <p className="text-muted-foreground p-3 text-xs">Loading…</p>
      )}
      {remaining > 0 && !state.loading && (
        <button
          type="button"
          onClick={onLoadMore}
          className="text-muted-foreground hover:text-foreground hover:bg-muted/40 w-full p-2 text-xs"
        >
          + Load 50 more ({remaining} remaining)
        </button>
      )}
    </div>
  );
}
