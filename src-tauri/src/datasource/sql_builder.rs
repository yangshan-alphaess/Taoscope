// SQL construction + result-row parsing shared by http_client and ws_client.
//
// These helpers contain no I/O. Both transports issue identical SQL via the
// `build_*` functions and post-process the resulting `(column_meta, rows)`
// tuples through the same parser helpers — keeping the two clients
// behaviourally identical.

use serde_json::Value as JsonValue;

use crate::datasource::types::Column;

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

pub fn build_count_stables_sql(db: &str) -> String {
    format!(
        "SELECT stable_name, COUNT(*) AS c FROM information_schema.ins_tables \
         WHERE db_name = {} GROUP BY stable_name",
        sql_str(db)
    )
}

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

pub fn column_index(
    column_meta: &[(String, String, u32)],
    name: &str,
) -> Option<usize> {
    column_meta
        .iter()
        .position(|(n, _, _)| n.eq_ignore_ascii_case(name))
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
