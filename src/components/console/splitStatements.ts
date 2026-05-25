export interface StatementRange {
  start: number;
  end: number;
  text: string;
}

export function splitStatements(sql: string): StatementRange[] {
  const ranges: StatementRange[] = [];
  let start = 0;
  for (let i = 0; i < sql.length; i++) {
    if (sql[i] === ";") {
      const text = sql.slice(start, i).trim();
      if (text.length > 0) ranges.push({ start, end: i, text });
      start = i + 1;
    }
  }
  const tail = sql.slice(start).trim();
  if (tail.length > 0) ranges.push({ start, end: sql.length, text: tail });
  return ranges;
}

export function findStatementAt(
  sql: string,
  cursorPos: number,
): StatementRange | null {
  const ranges = splitStatements(sql);
  if (ranges.length === 0) return null;
  for (const r of ranges) {
    if (cursorPos >= r.start && cursorPos <= r.end) return r;
  }
  return ranges[ranges.length - 1] ?? null;
}
