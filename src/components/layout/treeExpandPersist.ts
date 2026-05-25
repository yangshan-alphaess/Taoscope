export const TREE_EXPAND_STORAGE_KEY = "taoscope.tree.expanded";

export interface PersistedExpansion {
  conns: string[];
  dbs: string[];
  tables: string[];
  columns: string[];
  children: string[];
}

const EMPTY: PersistedExpansion = {
  conns: [],
  dbs: [],
  tables: [],
  columns: [],
  children: [],
};

export function loadPersistedExpansion(): PersistedExpansion {
  try {
    const raw = localStorage.getItem(TREE_EXPAND_STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as PersistedExpansion).conns) ||
      !Array.isArray((parsed as PersistedExpansion).dbs) ||
      !Array.isArray((parsed as PersistedExpansion).columns) ||
      !Array.isArray((parsed as PersistedExpansion).children)
    ) {
      return EMPTY;
    }
    const p = parsed as Partial<PersistedExpansion> & PersistedExpansion;
    // `tables` was added later — older entries don't have it.
    return { ...p, tables: Array.isArray(p.tables) ? p.tables : [] };
  } catch {
    return EMPTY;
  }
}

export function savePersistedExpansion(state: PersistedExpansion): void {
  try {
    localStorage.setItem(TREE_EXPAND_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / unavailability
  }
}

export function pruneByConnIds(
  arr: string[],
  validConnIds: Set<string>,
): string[] {
  return arr.filter((key) => {
    const connId = key.split("|", 1)[0] ?? "";
    return validConnIds.has(connId);
  });
}
