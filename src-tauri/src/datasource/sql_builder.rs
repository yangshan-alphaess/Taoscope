// SQL construction + result-row parsing shared by http_client and ws_client.
//
// These helpers contain no I/O. Both transports issue identical SQL via the
// `build_*` functions and post-process the resulting `(column_meta, rows)`
// tuples through the same parser helpers — keeping the two clients
// behaviourally identical.

use serde_json::Value as JsonValue;

use crate::datasource::types::{Column, Database, STable};

pub const SYSTEM_DATABASES: &[&str] =
    &["information_schema", "performance_schema"];

// ── Identifier / literal escaping ───────────────────────────────────────

/// Backtick-quote an identifier; double internal backticks.
pub fn ident(name: &str) -> String {
    format!("`{}`", name.replace('`', "``"))
}

/// Single-quote a SQL string literal; double internal single quotes.
pub fn sql_str(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

// ── SQL constructors ───────────────────────────────────────────────────

pub const SQL_SHOW_DATABASES: &str = "SHOW DATABASES";
pub const SQL_SHOW_STABLES: &str = "SHOW STABLES";
pub const SQL_SERVER_VERSION: &str = "SELECT SERVER_VERSION()";

pub fn build_list_child_tables_sql(
    db: &str,
    stable: &str,
    search: Option<&str>,
    page_size: u32,
    offset: u32,
) -> String {
    let search_clause = match search {
        Some(s) if !s.is_empty() => {
            format!(" AND table_name LIKE {}", sql_str(&format!("%{}%", s)))
        }
        _ => String::new(),
    };
    format!(
        "SELECT table_name FROM information_schema.ins_tables \
         WHERE db_name = {} AND stable_name = {}{} \
         LIMIT {} OFFSET {}",
        sql_str(db),
        sql_str(stable),
        search_clause,
        page_size,
        offset
    )
}

pub fn build_count_child_tables_sql(
    db: &str,
    stable: &str,
    search: Option<&str>,
) -> String {
    let search_clause = match search {
        Some(s) if !s.is_empty() => {
            format!(" AND table_name LIKE {}", sql_str(&format!("%{}%", s)))
        }
        _ => String::new(),
    };
    format!(
        "SELECT COUNT(*) FROM information_schema.ins_tables \
         WHERE db_name = {} AND stable_name = {}{}",
        sql_str(db),
        sql_str(stable),
        search_clause
    )
}

pub fn build_list_normal_tables_sql(
    db: &str,
    search: Option<&str>,
    page_size: u32,
    offset: u32,
) -> String {
    let search_clause = match search {
        Some(s) if !s.is_empty() => {
            format!(" AND table_name LIKE {}", sql_str(&format!("%{}%", s)))
        }
        _ => String::new(),
    };
    format!(
        "SELECT table_name FROM information_schema.ins_tables \
         WHERE db_name = {} AND type = 'NORMAL_TABLE'{} \
         LIMIT {} OFFSET {}",
        sql_str(db),
        search_clause,
        page_size,
        offset
    )
}

pub fn build_count_normal_tables_sql(db: &str, search: Option<&str>) -> String {
    let search_clause = match search {
        Some(s) if !s.is_empty() => {
            format!(" AND table_name LIKE {}", sql_str(&format!("%{}%", s)))
        }
        _ => String::new(),
    };
    format!(
        "SELECT COUNT(*) FROM information_schema.ins_tables \
         WHERE db_name = {} AND type = 'NORMAL_TABLE'{}",
        sql_str(db),
        search_clause
    )
}

pub fn build_describe_sql(db: &str, table: &str) -> String {
    format!("DESCRIBE {}.{}", ident(db), ident(table))
}

// ── Response parsers ───────────────────────────────────────────────────

pub fn parse_columns(column_meta: &[(String, String, u32)]) -> Vec<Column> {
    column_meta
        .iter()
        .map(|(name, data_type, length)| Column {
            name: name.clone(),
            data_type: data_type.clone(),
            length: if *length > 0 { Some(*length) } else { None },
            is_tag: None,
            is_primary_ts: None,
        })
        .collect()
}

pub fn cell_to_string(v: &JsonValue) -> Option<String> {
    match v {
        JsonValue::String(s) => Some(s.clone()),
        JsonValue::Null => None,
        other => Some(other.to_string()),
    }
}

pub fn cell_to_u32(v: &JsonValue) -> Option<u32> {
    match v {
        JsonValue::Number(n) => n.as_u64().map(|x| x as u32),
        JsonValue::String(s) => s.parse::<u32>().ok(),
        _ => None,
    }
}

// ── Normalized row → domain parsers ─────────────────────────────────────
//
// Both transports converge on `(columns: &[Column], rows: &[Vec<JsonValue>])`
// after their respective fetch step (the HTTP client normalizes its
// `column_meta` tuples via `parse_columns` first). These parsers contain the
// single source of truth for turning TDengine result rows into our domain
// types, so the http and ws clients stay behaviourally identical by
// construction rather than by copy-paste.

fn col_index(columns: &[Column], name: &str) -> Option<usize> {
    columns.iter().position(|c| c.name.eq_ignore_ascii_case(name))
}

/// Parse `SHOW DATABASES` rows, skipping system databases.
pub fn parse_databases(columns: &[Column], rows: &[Vec<JsonValue>]) -> Vec<Database> {
    let Some(name_idx) = col_index(columns, "name") else {
        return vec![];
    };
    let retention_idx = col_index(columns, "retention")
        .or_else(|| col_index(columns, "retentions"));
    let vgroups_idx = col_index(columns, "vgroups");
    let precision_idx = col_index(columns, "precision");

    let mut out: Vec<Database> = Vec::with_capacity(rows.len());
    for row in rows {
        let Some(name) = row.get(name_idx).and_then(cell_to_string) else {
            continue;
        };
        if SYSTEM_DATABASES.contains(&name.as_str()) {
            continue;
        }
        out.push(Database {
            name,
            retention: retention_idx.and_then(|i| row.get(i)).and_then(cell_to_string),
            vgroups: vgroups_idx.and_then(|i| row.get(i)).and_then(cell_to_u32),
            precision: precision_idx.and_then(|i| row.get(i)).and_then(cell_to_string),
        });
    }
    out
}

/// Parse `SHOW STABLES` rows into super-table names.
pub fn parse_stable_names(columns: &[Column], rows: &[Vec<JsonValue>]) -> Vec<String> {
    let Some(idx) =
        col_index(columns, "stable_name").or_else(|| col_index(columns, "name"))
    else {
        return vec![];
    };
    rows.iter()
        .filter_map(|r| r.get(idx).and_then(cell_to_string))
        .collect()
}

/// Build `STable` entries from super-table names. `child_count` stays `None`
/// because listing super tables intentionally skips the `COUNT(*)` round-trip
/// — counts are filled in lazily when the children pane expands.
pub fn assemble_stables(names: Vec<String>) -> Vec<STable> {
    names
        .into_iter()
        .map(|name| STable {
            name,
            columns: vec![],
            tag_columns: vec![],
            child_count: None,
        })
        .collect()
}

/// First-column values (table name listings).
pub fn parse_first_column_strings(rows: &[Vec<JsonValue>]) -> Vec<String> {
    rows.iter()
        .filter_map(|r| r.first().and_then(cell_to_string))
        .collect()
}

/// First cell of the first row as a count (COUNT(*) queries).
pub fn parse_scalar_count(rows: &[Vec<JsonValue>]) -> Option<u32> {
    rows.first().and_then(|r| r.first()).and_then(cell_to_u32)
}

/// Derive a definite paginated total from a short page response. When the
/// items query returns fewer rows than `page_size`, there cannot be more
/// rows past this page — total is exactly `offset + items_len`. When the
/// page came back full, we can't conclude anything cheaply; return `None`
/// and let the UI hide the badge until the user reaches the end (or
/// explicitly asks for a count).
pub fn derive_total_from_short_page(
    items_len: u32,
    page_size: u32,
    offset: u32,
) -> Option<u32> {
    if items_len < page_size {
        Some(offset + items_len)
    } else {
        None
    }
}

/// Parse `DESCRIBE` rows into columns, flagging tags and the primary timestamp.
pub fn parse_describe(columns: &[Column], rows: &[Vec<JsonValue>]) -> Vec<Column> {
    let field_idx = col_index(columns, "field").unwrap_or(0);
    let type_idx = col_index(columns, "type").unwrap_or(1);
    let length_idx = col_index(columns, "length");
    let note_idx = col_index(columns, "note");

    let mut out: Vec<Column> = Vec::with_capacity(rows.len());
    for (idx, row) in rows.iter().enumerate() {
        let Some(name) = row.get(field_idx).and_then(cell_to_string) else {
            continue;
        };
        let Some(data_type) = row.get(type_idx).and_then(cell_to_string) else {
            continue;
        };
        let length = length_idx
            .and_then(|i| row.get(i))
            .and_then(cell_to_u32)
            .filter(|n| *n > 0);
        let note = note_idx.and_then(|i| row.get(i)).and_then(cell_to_string);
        let is_tag_flag = note
            .as_deref()
            .map(|n| n.eq_ignore_ascii_case("TAG"))
            .unwrap_or(false);
        let is_tag = if is_tag_flag { Some(true) } else { None };
        let is_primary_ts =
            if idx == 0 && !is_tag_flag && data_type.eq_ignore_ascii_case("TIMESTAMP") {
                Some(true)
            } else {
                None
            };

        out.push(Column {
            name,
            data_type,
            length,
            is_tag,
            is_primary_ts,
        });
    }
    out
}
