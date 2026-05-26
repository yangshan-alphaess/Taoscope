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
  | { kind: "column"; from: number; tables: string[] }
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
    // Best-effort: peek both directions of the current statement for the
    // FROM clause so column suggestions can be narrowed to just those
    // table(s). Empty result is fine — the completion source then falls
    // back to "no schema columns" rather than dumping the whole db.
    return { kind: "column", from, tables: extractFromTables(doc, pos) };
  }

  return { kind: "keyword", from };
}

/**
 * Heuristically extract the table identifiers appearing after the FROM clause
 * of the statement containing `pos`. Returns an empty array if none can be
 * confidently identified. Supports simple JOINs, comma-separated tables, and
 * `db.table` qualified names. Aliases (`tbl t1`, `tbl AS t1`) are stripped.
 *
 * Intentionally permissive — we'd rather miss a table than mis-identify one,
 * since the consumer treats `[]` as "skip schema lookup, fall back".
 */
export function extractFromTables(doc: string, pos: number): string[] {
  // Confine to the current `;`-delimited statement so the previous query's
  // FROM clause doesn't leak into the active one.
  const stmtStart = doc.lastIndexOf(";", Math.max(0, pos - 1)) + 1;
  const semiAfter = doc.indexOf(";", pos);
  const stmtEnd = semiAfter === -1 ? doc.length : semiAfter;
  const stmt = stripNoise(doc.slice(stmtStart, stmtEnd));

  const fromMatch =
    /\bFROM\s+([\s\S]+?)(?=\b(?:WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|UNION|INTERVAL|PARTITION|WINDOW|SESSION|FILL)\b|$)/i.exec(
      stmt,
    );
  if (!fromMatch) return [];

  const parts = fromMatch[1]!.split(
    /,|\b(?:LEFT|RIGHT|INNER|OUTER|CROSS|FULL)?\s*JOIN\b/i,
  );
  const out: string[] = [];
  for (const raw of parts) {
    const onIdx = raw.search(/\bON\b/i);
    const slice = onIdx >= 0 ? raw.slice(0, onIdx) : raw;
    const tokens = slice.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    let name = tokens[0]!;
    const dot = name.lastIndexOf(".");
    if (dot >= 0) name = name.slice(dot + 1);
    name = name.replace(/[`"']/g, "");
    if (/^[\w$]+$/.test(name)) out.push(name);
  }
  return out;
}

/** Replace string/backtick/comment content with spaces — keeps lengths stable
 *  and prevents keywords inside literals from confusing the regex above. */
function stripNoise(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    const next = s[i + 1];
    if (ch === "'" || ch === '"') {
      const q = ch;
      out += " ";
      i++;
      while (i < s.length && s[i] !== q) {
        if (s[i] === "\\") {
          i++;
          if (i < s.length) i++;
          out += "  ";
          continue;
        }
        out += " ";
        i++;
      }
      if (i < s.length) {
        out += " ";
        i++;
      }
      continue;
    }
    if (ch === "`") {
      // Backtick-quoted identifiers are real names; keep them readable.
      i++;
      let ident = "";
      while (i < s.length && s[i] !== "`") {
        ident += s[i];
        i++;
      }
      if (i < s.length) i++;
      out += ident;
      continue;
    }
    if (ch === "-" && next === "-") {
      while (i < s.length && s[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    if (ch === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) {
        out += " ";
        i++;
      }
      if (i < s.length) {
        out += "  ";
        i += 2;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}
