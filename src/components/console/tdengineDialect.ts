/**
 * Custom CodeMirror SQL dialect for TDengine, intentionally small.
 *
 * Replaces the default MySQL dialect's huge keyword/function/type pool (which
 * floods the autocomplete popup with hundreds of irrelevant suggestions).
 * Schema-aware items (databases / stables / tables / columns) come from
 * `createSqlCompletionSource`; this dialect supplies only the SQL grammar
 * keywords needed for syntax highlighting + the small keyword popup.
 */

import { SQLDialect } from "@codemirror/lang-sql";

const KEYWORDS = [
  // Core DML / DQL
  "select", "from", "where", "group", "by", "having", "order", "limit", "offset",
  "insert", "into", "values", "update", "set", "delete",
  // DDL
  "create", "alter", "drop", "database", "table", "stable", "using",
  // Joins / set ops
  "as", "join", "inner", "left", "right", "outer", "on", "union", "all", "distinct",
  // Flow / predicates
  "case", "when", "then", "else", "end", "if", "exists",
  "not", "null", "is", "and", "or", "in", "between", "like",
  "asc", "desc",
  // Aggregates (common)
  "count", "sum", "avg", "min", "max",
  // TDengine specifics
  "show", "describe", "use", "explain", "tags", "tag",
  "interval", "fill", "partition", "every", "sliding", "session", "window",
].join(" ");

const TYPES = [
  "timestamp", "int", "bigint", "smallint", "tinyint",
  "float", "double", "bool", "binary", "nchar", "varchar", "json",
  "unsigned",
].join(" ");

const BUILTIN = ["tbname", "now"].join(" ");

export const TDengineDialect = SQLDialect.define({
  keywords: KEYWORDS,
  types: TYPES,
  builtin: BUILTIN,
  operatorChars: "*+-%<>!=&|/^",
  identifierQuotes: "`",
});
