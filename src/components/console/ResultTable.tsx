import type { Column, QueryResult } from "@/datasource/types";

function formatCell(value: unknown, col: Column): string {
  if (value === null || value === undefined) return "NULL";
  if (col.type === "TIMESTAMP" && typeof value === "number") {
    return new Date(value).toISOString();
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function ResultTable({ result }: { result: QueryResult }) {
  return (
    <table className="w-full border-collapse font-mono text-xs">
      <thead className="bg-card border-border sticky top-0 border-b">
        <tr>
          {result.columns.map((c) => (
            <th
              key={c.name}
              className="border-border border-r px-3 py-1.5 text-left font-medium whitespace-nowrap last:border-r-0"
            >
              <span>{c.name}</span>
              <span className="text-muted-foreground/70 ml-1">
                {c.type}
                {c.isTag ? " · tag" : ""}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result.rows.map((row, i) => (
          <tr key={i} className="border-border hover:bg-muted/30 border-b">
            {row.map((cell, j) => {
              const col = result.columns[j];
              return (
                <td
                  key={j}
                  className="border-border border-r px-3 py-1 whitespace-nowrap last:border-r-0"
                >
                  {col ? formatCell(cell, col) : String(cell ?? "")}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
