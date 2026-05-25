export const IS_MAC =
  typeof navigator !== "undefined" &&
  (navigator.platform.toLowerCase().includes("mac") ||
    navigator.userAgent.toLowerCase().includes("mac"));

export const MOD = IS_MAC ? "⌘" : "Ctrl+";
export const SHIFT = IS_MAC ? "⇧" : "Shift+";

const MAC_MOD_ORDER: Record<string, number> = { Shift: 1, Mod: 2 };

export function fmtShortcut(parts: string[]): string {
  if (IS_MAC) {
    const mods = parts.filter((p) => p === "Mod" || p === "Shift");
    const others = parts.filter((p) => p !== "Mod" && p !== "Shift");
    mods.sort(
      (a, b) => (MAC_MOD_ORDER[a] ?? 99) - (MAC_MOD_ORDER[b] ?? 99),
    );
    return [...mods, ...others]
      .map((p) => {
        if (p === "Mod") return "⌘";
        if (p === "Shift") return "⇧";
        if (p === "Enter") return "↩";
        return p;
      })
      .join("");
  }
  return parts
    .map((p) => {
      if (p === "Mod") return "Ctrl";
      return p;
    })
    .join("+");
}
