import type { TzPref } from "@/state/displayPrefs";

export type { TzPref };

export interface TzPreset {
  /** i18n key under `console.toolbar.timezone.preset.*`. */
  i18nKey: string;
  /** Stable id for menu rendering / selection checks. */
  id: string;
  tz: TzPref;
}

export const TZ_PRESETS: readonly TzPreset[] = [
  { id: "system", i18nKey: "system", tz: { kind: "system" } },
  { id: "utc", i18nKey: "utc", tz: { kind: "utc" } },
  {
    id: "iana:Asia/Shanghai",
    i18nKey: "shanghai",
    tz: { kind: "iana", name: "Asia/Shanghai" },
  },
  {
    id: "iana:Asia/Tokyo",
    i18nKey: "tokyo",
    tz: { kind: "iana", name: "Asia/Tokyo" },
  },
  {
    id: "iana:Asia/Kolkata",
    i18nKey: "kolkata",
    tz: { kind: "iana", name: "Asia/Kolkata" },
  },
] as const;

export const OFFSET_MIN_MINUTES = -12 * 60;
export const OFFSET_MAX_MINUTES = 14 * 60;

function pad2(n: number): string {
  return Math.abs(n).toString().padStart(2, "0");
}

function pad3(n: number): string {
  return Math.abs(n).toString().padStart(3, "0");
}

/** Render a signed minute offset as `±HH:mm`. */
export function formatOffsetMinutes(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  return `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

/** Parse user-typed offset like `+08:00`, `-5`, `+5.5` to signed minutes. */
export function parseOffsetInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = /^([+-]?)(\d{1,2})(?::([0-5]?\d)|\.(\d+))?$/.exec(trimmed);
  if (!match) return null;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number.parseInt(match[2] ?? "0", 10);
  let minutes = 0;
  if (match[3] !== undefined) {
    minutes = Number.parseInt(match[3], 10);
  } else if (match[4] !== undefined) {
    const frac = Number.parseFloat(`0.${match[4]}`);
    minutes = Math.round(frac * 60);
  }
  const total = sign * (hours * 60 + minutes);
  if (total < OFFSET_MIN_MINUTES || total > OFFSET_MAX_MINUTES) return null;
  return total;
}

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  ms: number;
}

function partsFromUtc(d: Date): DateParts {
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    ms: d.getUTCMilliseconds(),
  };
}

/** Extract Y/M/D/H/m/s/ms in the given IANA zone for the given instant. */
function partsInZone(date: Date, timeZone: string | undefined): DateParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const out: Partial<DateParts> = {};
  for (const part of fmt.formatToParts(date)) {
    switch (part.type) {
      case "year":
        out.year = Number.parseInt(part.value, 10);
        break;
      case "month":
        out.month = Number.parseInt(part.value, 10);
        break;
      case "day":
        out.day = Number.parseInt(part.value, 10);
        break;
      case "hour":
        // Intl emits "24" at midnight in some zones; normalize to 0.
        out.hour = Number.parseInt(part.value, 10) % 24;
        break;
      case "minute":
        out.minute = Number.parseInt(part.value, 10);
        break;
      case "second":
        out.second = Number.parseInt(part.value, 10);
        break;
    }
  }
  // Intl.DateTimeFormat doesn't reliably expose milliseconds across engines;
  // milliseconds are the same in every zone, so reuse the UTC ms.
  out.ms = date.getUTCMilliseconds();
  return out as DateParts;
}

/** Resolve the active offset (in minutes east of UTC) for an IANA zone at a given instant. */
export function offsetMinutesForIana(name: string, at: Date = new Date()): number {
  // Render the same instant once in UTC and once in the target zone; the
  // difference in walltime is the zone's offset.
  const utc = partsFromUtc(at);
  const local = partsInZone(at, name);
  const utcMs = Date.UTC(
    utc.year,
    utc.month - 1,
    utc.day,
    utc.hour,
    utc.minute,
    utc.second,
  );
  const localMs = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  return Math.round((localMs - utcMs) / 60_000);
}

/** Active offset for the host system at a given instant. */
export function offsetMinutesForSystem(at: Date = new Date()): number {
  // `Date.getTimezoneOffset` returns minutes west of UTC — flip the sign.
  return -at.getTimezoneOffset();
}

/** Resolve a `TzPref` to its current offset string, e.g. `+08:00`, `Z`, `+05:30`. */
export function offsetSuffixFor(tz: TzPref, at: Date = new Date()): string {
  switch (tz.kind) {
    case "utc":
      return "Z";
    case "system":
      return formatOffsetMinutes(offsetMinutesForSystem(at));
    case "iana":
      return formatOffsetMinutes(offsetMinutesForIana(tz.name, at));
    case "offset":
      return formatOffsetMinutes(tz.minutes);
  }
}

function renderParts(parts: DateParts, suffix: string): string {
  return (
    `${parts.year.toString().padStart(4, "0")}-` +
    `${pad2(parts.month)}-${pad2(parts.day)}T` +
    `${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}.` +
    `${pad3(parts.ms)}${suffix}`
  );
}

/**
 * Convert a TDengine TIMESTAMP cell (epoch ms `number`, ISO `string`, or
 * unknown) into an ISO-like display string under the given timezone.
 *
 * - `number` → epoch ms, rendered in the target zone with the appropriate
 *   suffix (`Z`, `±HH:mm`).
 * - `string` → parsed via `Date.parse`; if NaN, returned unchanged.
 * - other → `String(value)` fallback.
 */
export function formatTimestamp(value: unknown, tz: TzPref): string {
  let date: Date;
  if (typeof value === "number") {
    date = new Date(value);
  } else if (typeof value === "string") {
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) return value;
    date = new Date(ms);
  } else {
    return String(value);
  }
  if (Number.isNaN(date.getTime())) return String(value);

  if (tz.kind === "utc") {
    return renderParts(partsFromUtc(date), "Z");
  }
  if (tz.kind === "iana") {
    const parts = partsInZone(date, tz.name);
    return renderParts(parts, formatOffsetMinutes(offsetMinutesForIana(tz.name, date)));
  }
  if (tz.kind === "system") {
    const parts = partsInZone(date, undefined);
    return renderParts(parts, formatOffsetMinutes(offsetMinutesForSystem(date)));
  }
  // tz.kind === "offset"
  const shifted = new Date(date.getTime() + tz.minutes * 60_000);
  return renderParts(partsFromUtc(shifted), formatOffsetMinutes(tz.minutes));
}
