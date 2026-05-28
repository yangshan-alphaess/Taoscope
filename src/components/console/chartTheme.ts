/**
 * Shared echarts initialization + theme tuned to the app's dark palette.
 *
 * Modular imports only — keep the bundle to LineChart + the components
 * we actually use, instead of pulling all of `echarts`.
 */
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { UniversalTransition } from "echarts/features";

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  CanvasRenderer,
  UniversalTransition,
]);

export { echarts };

// Multi-series palette. Starts with the brand primary so a single-line
// chart picks up the app's signature green, then walks through hues that
// stay legible on the dark background.
export const SERIES_PALETTE = [
  "#06A77D", // brand
  "#3FA9F5",
  "#F5A623",
  "#E94E77",
  "#9B6CFF",
  "#F7D154",
  "#4ECDC4",
  "#F87060",
];

/** Resolve an `hsl(var(--name))` token from the live CSS variables, with
 *  a static fallback for safety (so the chart never blank-strokes if the
 *  computed style is unavailable). */
export function readCssHsl(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    if (!raw) return fallback;
    return `hsl(${raw})`;
  } catch {
    return fallback;
  }
}
