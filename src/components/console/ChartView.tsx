import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  analyzeYCandidates,
  buildSeriesPoints,
} from "@/components/console/chartAnalyzer";
import {
  echarts,
  readCssHsl,
  SERIES_PALETTE,
} from "@/components/console/chartTheme";

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
  // Y candidates are the best-scoring "looks-like-a-metric" columns. The
  // analyzer is value-aware: a string column whose cells all parse as
  // numbers still qualifies (BIGINT often arrives serialized as a string),
  // while a numeric-typed column with any non-numeric string value drops
  // out. See chartAnalyzer.ts for the full heuristic.
  const yCandidates = useMemo(() => analyzeYCandidates(result), [result]);

  // Default Y selection: top-scoring candidate. Resets when the result
  // changes so stale column names don't linger after a different query.
  const [yColumns, setYColumns] = useState<string[]>([]);
  useEffect(() => {
    const first = yCandidates[0]?.column.name;
    setYColumns(first ? [first] : []);
  }, [yCandidates]);

  function toggleY(name: string) {
    setYColumns((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }

  // Chart instance lifecycle. We init lazily on first mount, dispose on
  // unmount, and re-set the option whenever the data, X, or Y selection
  // changes. A ResizeObserver keeps the chart fitting its container when
  // panels resize or the user toggles between Table/Chart views.
  const chartHostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);

  useEffect(() => {
    const host: HTMLDivElement | null = chartHostRef.current;
    if (!host) return;
    const hostEl: HTMLDivElement = host;
    const inst = echarts.init(host, undefined, { renderer: "canvas" });
    chartRef.current = inst;
    const ro = new ResizeObserver(() => inst.resize());
    ro.observe(host);

    // Custom wheel-to-zoom. echarts' built-in inside-zoom uses a hard-
    // coded zoom factor per wheel tick (~1.05), which feels fine for a
    // real scroll-wheel but is overwhelmingly aggressive on Mac trackpads
    // where one gesture can produce dozens of small deltaY events. We
    // disable the default (zoomOnMouseWheel: false in the option) and
    // implement our own that scales the zoom step linearly with deltaY,
    // tuned via a single knob.
    const ZOOM_SENSITIVITY = 0.0008;
    function onWheel(e: WheelEvent) {
      // Only intercept vertical wheels; horizontal swipes (deltaX) are
      // ignored so two-finger horizontal scrolls don't accidentally zoom.
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      e.preventDefault();
      const opt = inst.getOption() as {
        dataZoom?: Array<{ start?: number; end?: number }>;
      };
      const dz = opt.dataZoom?.[0];
      if (!dz) return;
      const start = dz.start ?? 0;
      const end = dz.end ?? 100;
      const span = end - start;
      if (span <= 0) return;
      // Zoom toward the cursor's x position so the user-visible point
      // under the pointer stays put — matches how map/chart UIs feel.
      const rect = hostEl.getBoundingClientRect();
      const xRatio =
        rect.width > 0
          ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
          : 0.5;
      const focus = start + span * xRatio;
      // deltaY > 0 (scroll down) → zoom out; deltaY < 0 → zoom in.
      const factor = 1 + e.deltaY * ZOOM_SENSITIVITY;
      const newSpan = Math.max(0.1, Math.min(100, span * factor));
      const rawStart = focus - (focus - start) * (newSpan / span);
      const newStart = Math.max(0, Math.min(100 - newSpan, rawStart));
      inst.dispatchAction({
        type: "dataZoom",
        start: newStart,
        end: newStart + newSpan,
      });
    }
    hostEl.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      hostEl.removeEventListener("wheel", onWheel);
      ro.disconnect();
      inst.dispose();
      chartRef.current = null;
    };
  }, []);

  // Compose the echarts option. Wrapped in useMemo + try/catch so a
  // surprise row shape never crashes the panel — worst case, an empty
  // option clears the chart but the toolbar stays intact.
  const option = useMemo(() => {
    try {
      if (!xColumn || yColumns.length === 0) return null;
      const fg = readCssHsl("--foreground", "#e6e7eb");
      const muted = readCssHsl("--muted-foreground", "#c2c4cb");
      const border = readCssHsl("--border", "#3b3d44");

      // Build series + per-series magnitude. When ≥2 series differ by >10x
      // in max absolute value, split the chart into dual Y axes (small on
      // left, big on right) so small-range metrics like a temperature
      // don't get squashed flat by a BIGINT counter alongside.
      const seriesData = yColumns.map((yName) =>
        buildSeriesPoints(result, xColumn.name, yName),
      );
      const maxes = seriesData.map((pts) => {
        let m = 0;
        for (const [, y] of pts) {
          const a = Math.abs(y);
          if (a > m) m = a;
        }
        return m;
      });
      let yAxisAssignments = yColumns.map(() => 0);
      let useDualAxis = false;
      if (yColumns.length >= 2) {
        const sorted = maxes
          .map((m, i) => ({ m, i }))
          .sort((a, b) => a.m - b.m);
        let bestRatio = 1;
        let splitAt = -1;
        for (let k = 1; k < sorted.length; k++) {
          const prev = sorted[k - 1]!.m;
          const cur = sorted[k]!.m;
          const ratio = cur / Math.max(prev, 1e-12);
          if (ratio > bestRatio) {
            bestRatio = ratio;
            splitAt = k;
          }
        }
        if (bestRatio > 10 && splitAt > 0) {
          useDualAxis = true;
          const bigGroup = new Set(
            sorted.slice(splitAt).map((x) => x.i),
          );
          yAxisAssignments = yColumns.map((_, i) =>
            bigGroup.has(i) ? 1 : 0,
          );
        }
      }
      const series = yColumns.map((yName, i) => ({
        name: yName,
        type: "line" as const,
        showSymbol: false,
        smooth: true,
        sampling: "lttb" as const,
        connectNulls: false,
        lineStyle: { width: 1.5 },
        emphasis: { focus: "series" as const },
        data: seriesData[i] ?? [],
        color: SERIES_PALETTE[i % SERIES_PALETTE.length],
        yAxisIndex: yAxisAssignments[i] ?? 0,
      }));
      const yAxisStyle = {
        type: "value" as const,
        scale: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: muted },
        splitLine: { lineStyle: { color: border, opacity: 0.35 } },
      };
      const yAxisDef = useDualAxis
        ? [
            { ...yAxisStyle, position: "left" as const },
            {
              ...yAxisStyle,
              position: "right" as const,
              splitLine: { show: false },
            },
          ]
        : yAxisStyle;
      return {
        animation: false,
        color: SERIES_PALETTE,
        backgroundColor: "transparent",
        textStyle: { color: fg, fontFamily: "inherit", fontSize: 11 },
        grid: {
          top: 28,
          right: useDualAxis ? 60 : 18,
          bottom: 44,
          left: 52,
        },
        legend: {
          top: 4,
          right: 12,
          textStyle: { color: muted, fontSize: 11 },
          icon: "roundRect",
          itemWidth: 10,
          itemHeight: 6,
        },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "cross", lineStyle: { color: border } },
          backgroundColor: "rgba(20,22,26,0.92)",
          borderColor: border,
          textStyle: { color: fg, fontSize: 11 },
        },
        xAxis: {
          type: "time",
          axisLine: { lineStyle: { color: border } },
          axisLabel: { color: muted, hideOverlap: true },
          splitLine: { show: false },
        },
        yAxis: yAxisDef,
        dataZoom: [
          {
            type: "inside",
            throttle: 50,
            // We replace the default wheel-zoom with a sensitivity-tuned
            // handler attached on the chart host (see init useEffect).
            // Mouse-drag panning inside the grid remains via this entry.
            zoomOnMouseWheel: false,
          },
          {
            type: "slider",
            height: 16,
            bottom: 8,
            borderColor: "transparent",
            backgroundColor: "transparent",
            fillerColor: "rgba(6,167,125,0.18)",
            handleStyle: { color: SERIES_PALETTE[0] },
            moveHandleStyle: { color: SERIES_PALETTE[0], opacity: 0.6 },
            textStyle: { color: muted, fontSize: 10 },
          },
        ],
        series,
      };
    } catch {
      return null;
    }
  }, [result, xColumn, yColumns]);

  // Remember which result we last rendered, so a Y-checkbox change
  // (same data, new series list) can carry the user's current dataZoom
  // window forward — while a brand-new query still resets to 0–100%.
  const lastRenderedResultRef = useRef<typeof result | null>(null);

  useEffect(() => {
    const inst = chartRef.current;
    if (!inst) return;
    if (!option) {
      inst.clear();
      lastRenderedResultRef.current = null;
      return;
    }
    const sameQuery = lastRenderedResultRef.current === result;
    let toApply: typeof option = option;
    if (sameQuery) {
      // Read the live dataZoom range and splice it into the new option
      // so the time axis doesn't reset when the user toggles a Y series.
      const live = inst.getOption() as {
        dataZoom?: Array<{ start?: number; end?: number }>;
      };
      const curDz = live.dataZoom?.[0];
      if (curDz && option.dataZoom) {
        toApply = {
          ...option,
          dataZoom: option.dataZoom.map((dz) => ({
            ...dz,
            start: curDz.start,
            end: curDz.end,
          })),
        } as typeof option;
      }
    }
    // `replaceMerge: ['series', 'yAxis']` fully replaces those arrays so
    // unchecked series don't linger as ghost lines and the yAxis flip
    // between single and dual mode applies cleanly — while leaving the
    // dataZoom component's internal state intact for the merge path.
    inst.setOption(toApply, {
      notMerge: false,
      replaceMerge: ["series", "yAxis"],
    });
    lastRenderedResultRef.current = result;
  }, [option, result]);

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
                {yCandidates.length === 0 ? (
                  <p className="text-muted-foreground/70 italic">
                    {t("chart.settings.y-axis-empty")}
                  </p>
                ) : (
                  <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                    {yCandidates.map(({ column: col }) => {
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
      <div className="relative flex min-h-0 flex-1">
        <div ref={chartHostRef} className="absolute inset-0" />
        {(!xColumn || yColumns.length === 0) && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4">
            <p className="text-muted-foreground/60 text-xs">
              {!xColumn
                ? t("chart.no-time-column")
                : t("chart.no-y-selected")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
