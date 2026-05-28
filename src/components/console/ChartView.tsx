import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Settings2 } from "lucide-react";

import type { Column, QueryResult } from "@/datasource/types";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

const NUMERIC_TYPES = new Set([
  "INT",
  "BIGINT",
  "SMALLINT",
  "TINYINT",
  "INT UNSIGNED",
  "BIGINT UNSIGNED",
  "SMALLINT UNSIGNED",
  "TINYINT UNSIGNED",
  "FLOAT",
  "DOUBLE",
]);

function isNumeric(col: Column): boolean {
  return NUMERIC_TYPES.has(col.type);
}

function findXAxisColumn(cols: Column[]): Column | null {
  return (
    cols.find((c) => c.isPrimaryTs) ??
    cols.find((c) => c.type === "TIMESTAMP") ??
    null
  );
}

export function ChartView({ result }: { result: QueryResult }) {
  const { t } = useTranslation("result");

  const xColumn = useMemo(() => findXAxisColumn(result.columns), [result]);
  const numericColumns = useMemo(
    () => result.columns.filter(isNumeric),
    [result],
  );

  // Default Y selection: first numeric column. Reset whenever the underlying
  // result changes so stale column names don't linger after a different query.
  const [yColumns, setYColumns] = useState<string[]>([]);
  useEffect(() => {
    const first = numericColumns[0]?.name;
    setYColumns(first ? [first] : []);
  }, [numericColumns]);

  function toggleY(name: string) {
    setYColumns((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="border-border flex shrink-0 items-center gap-1 border-b bg-gradient-to-b from-white/[0.03] to-transparent px-2 py-1">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              title={t("chart.settings.title")}
              className="text-muted-foreground hover:text-foreground hover:bg-muted/50 flex items-center gap-1 rounded-sm px-2 py-1 text-xs"
            >
              <Settings2 className="h-3 w-3" />
              <span>{t("chart.settings.title")}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-3">
            <div className="space-y-3 text-xs">
              <div>
                <p className="text-muted-foreground mb-1 font-medium">
                  {t("chart.settings.x-axis")}
                </p>
                <p className="bg-muted/40 text-foreground rounded-sm px-2 py-1 font-mono">
                  {xColumn
                    ? xColumn.name
                    : t("chart.settings.x-axis-unavailable")}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1 font-medium">
                  {t("chart.settings.y-axis")}
                </p>
                {numericColumns.length === 0 ? (
                  <p className="text-muted-foreground/70 italic">
                    {t("chart.settings.y-axis-empty")}
                  </p>
                ) : (
                  <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                    {numericColumns.map((col) => {
                      const checked = yColumns.includes(col.name);
                      return (
                        <label
                          key={col.name}
                          className={cn(
                            "hover:bg-muted/40 flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1",
                            checked && "bg-muted/30",
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleY(col.name)}
                          />
                          <span className="font-mono">{col.name}</span>
                          <span className="text-muted-foreground/60 ml-auto">
                            {col.type}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <span className="text-muted-foreground/60 ml-auto text-xs">
          {xColumn
            ? t("chart.axes-summary", {
                x: xColumn.name,
                y: yColumns.length > 0 ? yColumns.join(", ") : "—",
              })
            : t("chart.no-time-column")}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4">
        <p className="text-muted-foreground/60 text-xs">
          {t("chart.placeholder")}
        </p>
      </div>
    </div>
  );
}
