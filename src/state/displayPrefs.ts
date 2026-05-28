import { create } from "zustand";

export type TzPref =
  | { kind: "system" }
  | { kind: "utc" }
  | { kind: "iana"; name: string }
  | { kind: "offset"; minutes: number };

const STORAGE_KEY = "taoscope.tz";
const DEFAULT_TZ: TzPref = { kind: "system" };

function serializeTz(tz: TzPref): string {
  switch (tz.kind) {
    case "system":
      return "system";
    case "utc":
      return "utc";
    case "iana":
      return `iana:${tz.name}`;
    case "offset":
      return `offset:${tz.minutes}`;
  }
}

function parseTz(raw: string | null | undefined): TzPref {
  if (!raw) return DEFAULT_TZ;
  if (raw === "system") return { kind: "system" };
  if (raw === "utc") return { kind: "utc" };
  if (raw.startsWith("iana:")) {
    const name = raw.slice("iana:".length);
    if (!name) return DEFAULT_TZ;
    return { kind: "iana", name };
  }
  if (raw.startsWith("offset:")) {
    const n = Number.parseInt(raw.slice("offset:".length), 10);
    if (!Number.isFinite(n)) return DEFAULT_TZ;
    return { kind: "offset", minutes: n };
  }
  return DEFAULT_TZ;
}

function hydrate(): TzPref {
  try {
    return parseTz(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_TZ;
  }
}

function persist(tz: TzPref): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeTz(tz));
  } catch {
    // Ignore quota / private-browsing failures; in-memory state still updates.
  }
}

interface DisplayPrefsState {
  tz: TzPref;
  setTz: (next: TzPref) => void;
}

export const useDisplayPrefs = create<DisplayPrefsState>((set) => ({
  tz: hydrate(),
  setTz: (next) => {
    persist(next);
    set({ tz: next });
  },
}));

export const __TEST_ONLY = { parseTz, serializeTz, STORAGE_KEY, DEFAULT_TZ };
