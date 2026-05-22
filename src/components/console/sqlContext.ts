/**
 * Heuristic SQL cursor-context detector for editor autocompletion.
 *
 * Given a document and cursor position, returns the kind of completion that
 * should be surfaced (table/column/database/dotted column/none). Strings and
 * comments are treated as "none" so the popup does not pollute prose.
 *
 * Intentional Phase 1 limitation: no alias / CTE / subquery awareness.
 */

export type CursorContext =
  | { kind: "database"; from: number }
  | { kind: "table"; from: number }
  | { kind: "tableColumn"; from: number; table: string }
  | { kind: "column"; from: number }
  | { kind: "keyword"; from: number }
  | { kind: "none"; from: number };

const WINDOW_SIZE = 200;

/**
 * Returns true if the position at `window[pos]` is inside an unterminated
 * string or comment. Conservative on ambiguity.
 */
export function isInsideStringOrComment(window: string, pos: number): boolean {
  type State = "normal" | "sQ" | "dQ" | "bT" | "lineCmt" | "blockCmt";
  let state: State = "normal";
  for (let i = 0; i < pos; i++) {
    const ch = window[i];
    const next = window[i + 1];
    switch (state) {
      case "normal":
        if (ch === "'") state = "sQ";
        else if (ch === '"') state = "dQ";
        else if (ch === "`") state = "bT";
        else if (ch === "-" && next === "-") {
          state = "lineCmt";
          i++;
        } else if (ch === "/" && next === "*") {
          state = "blockCmt";
          i++;
        }
        break;
      case "sQ":
        if (ch === "'" && window[i - 1] !== "\\") state = "normal";
        break;
      case "dQ":
        if (ch === '"' && window[i - 1] !== "\\") state = "normal";
        break;
      case "bT":
        if (ch === "`") state = "normal";
        break;
      case "lineCmt":
        if (ch === "\n") state = "normal";
        break;
      case "blockCmt":
        if (ch === "*" && next === "/") {
          state = "normal";
          i++;
        }
        break;
    }
  }
  return state !== "normal";
}

function findLastIndex(text: string, pattern: RegExp): number {
  let lastIdx = -1;
  let m: RegExpExecArray | null;
  pattern.lastIndex = 0;
  while ((m = pattern.exec(text)) !== null) {
    lastIdx = m.index;
    if (m.index === pattern.lastIndex) pattern.lastIndex++;
  }
  return lastIdx;
}

export function detectContext(doc: string, pos: number): CursorContext {
  const start = Math.max(0, pos - WINDOW_SIZE);
  const window = doc.slice(start, pos);

  if (isInsideStringOrComment(window, window.length)) {
    return { kind: "none", from: pos };
  }

  // The in-progress identifier (may be empty) is what the user is currently
  // typing — its length determines the replacement range `from`.
  const tailMatch = /([\w$]*)$/.exec(window);
  const ident = tailMatch?.[1] ?? "";
  const from = pos - ident.length;
  const lead = window.slice(0, window.length - ident.length);

  // 1. `table.` dot reference — strongest signal.
  const dotMatch = /([\w$]+)\.$/.exec(lead);
  if (dotMatch && dotMatch[1]) {
    return { kind: "tableColumn", from, table: dotMatch[1] };
  }

  // 2. USE / SHOW (S)TABLES FROM → database.
  if (/\b(?:USE|SHOW\s+S?TABLES\s+FROM)\s+$/i.test(lead)) {
    return { kind: "database", from };
  }

  // 3. FROM/JOIN/UPDATE/INTO with optional comma-completed prior tables → table.
  if (/\b(?:FROM|JOIN|UPDATE|INTO)\s+(?:[\w$.]+\s*,\s*)*$/i.test(lead)) {
    return { kind: "table", from };
  }

  // 4. SELECT/WHERE/HAVING/ON/SET/GROUP BY/ORDER BY → column, provided the
  //    most recent column-context keyword comes after any FROM-family keyword.
  const lastFrom = findLastIndex(lead, /\b(?:FROM|JOIN|UPDATE|INTO)\b/gi);
  const lastCol = findLastIndex(
    lead,
    /\b(?:SELECT|WHERE|HAVING|ON|SET|GROUP\s+BY|ORDER\s+BY)\b/gi,
  );
  if (lastCol > lastFrom) {
    return { kind: "column", from };
  }

  return { kind: "keyword", from };
}
