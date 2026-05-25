import { format } from "sql-formatter";

export const FORMAT_OPTIONS = {
  language: "mysql" as const,
  tabWidth: 2,
  keywordCase: "upper" as const,
  linesBetweenQueries: 1,
};

export type FormatResult =
  | { ok: true; formatted: string }
  | { ok: false; message: string };

export function formatScratch(sql: string): FormatResult {
  try {
    return { ok: true, formatted: format(sql, FORMAT_OPTIONS) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message: message.slice(0, 100) };
  }
}
