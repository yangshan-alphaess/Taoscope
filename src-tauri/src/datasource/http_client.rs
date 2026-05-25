// TDengine 3.x HTTP REST client.
//
// All 7 schema/query methods route through `execute_sql()` which POSTs raw SQL
// to TDengine's REST endpoint and parses the `{code, desc, column_meta, data,
// rows}` envelope. A process-wide `OnceLock<reqwest::Client>` reuses TCP /
// TLS pools across invocations.

use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use base64::engine::general_purpose;
use base64::Engine as _;
use reqwest::Client;
use serde::Deserialize;
use serde_json::Value as JsonValue;

use crate::datasource::error::DataSourceError;
use crate::datasource::types::{
    Column, Connection, Database, ListTablesOpts, Paged, QueryResult, STable, Table,
    TestConnectionResult,
};

static HTTP_CLIENT: OnceLock<Client> = OnceLock::new();

fn http_client() -> &'static Client {
    HTTP_CLIENT.get_or_init(|| {
        Client::builder()
            .user_agent("Taoscope/0.1")
            .pool_idle_timeout(Duration::from_secs(90))
            .build()
            .expect("failed to build reqwest client")
    })
}

fn endpoint(conn: &Connection, db: Option<&str>) -> String {
    match db {
        Some(d) => format!(
            "http://{}:{}/rest/sql/{}",
            conn.host,
            conn.port,
            urlencoding::encode(d)
        ),
        None => format!("http://{}:{}/rest/sql", conn.host, conn.port),
    }
}

fn auth_header(conn: &Connection) -> String {
    let credentials = format!("{}:{}", conn.user, conn.password);
    format!("Basic {}", general_purpose::STANDARD.encode(credentials))
}

#[derive(Debug, Deserialize)]
struct TdResponse {
    code: i32,
    #[serde(default)]
    desc: Option<String>,
    #[serde(default)]
    column_meta: Vec<(String, String, u32)>,
    #[serde(default)]
    data: Vec<Vec<JsonValue>>,
    #[serde(default)]
    rows: u32,
}

async fn execute_sql(
    conn: &Connection,
    db: Option<&str>,
    sql: &str,
) -> Result<TdResponse, DataSourceError> {
    let resp = http_client()
        .post(endpoint(conn, db))
        .header("Authorization", auth_header(conn))
        .header("Content-Type", "text/plain")
        .body(sql.to_string())
        .send()
        .await
        .map_err(|e| DataSourceError::Network(e.to_string()))?;

    let status = resp.status();
    if status == reqwest::StatusCode::UNAUTHORIZED {
        let text = resp.text().await.unwrap_or_default();
        return Err(DataSourceError::Auth(format!("HTTP 401: {}", text)));
    }

    let body: TdResponse = resp
        .json()
        .await
        .map_err(|e| DataSourceError::Other(format!("parse response: {}", e)))?;

    if body.code != 0 {
        return Err(DataSourceError::Sql(
            body.desc
                .unwrap_or_else(|| format!("TDengine error code {}", body.code)),
        ));
    }

    Ok(body)
}

fn parse_columns(column_meta: &[(String, String, u32)]) -> Vec<Column> {
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

fn column_index(column_meta: &[(String, String, u32)], name: &str) -> Option<usize> {
    column_meta.iter().position(|(n, _, _)| n.eq_ignore_ascii_case(name))
}

fn cell_to_string(v: &JsonValue) -> Option<String> {
    match v {
        JsonValue::String(s) => Some(s.clone()),
        JsonValue::Null => None,
        other => Some(other.to_string()),
    }
}

fn cell_to_u32(v: &JsonValue) -> Option<u32> {
    match v {
        JsonValue::Number(n) => n.as_u64().map(|x| x as u32),
        JsonValue::String(s) => s.parse::<u32>().ok(),
        _ => None,
    }
}

// Identifier escape: backtick-wrap and double internal backticks.
fn ident(name: &str) -> String {
    format!("`{}`", name.replace('`', "``"))
}

// String literal escape: surround with single quotes; double internal singles.
fn sql_str(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

const SYSTEM_DATABASES: &[&str] = &[
    "information_schema",
    "performance_schema",
];

// ── Public methods ──────────────────────────────────────────────────────

pub async fn test_connection(conn: &Connection) -> TestConnectionResult {
    match execute_sql(conn, None, "SELECT SERVER_VERSION()").await {
        Ok(resp) => {
            let msg = resp
                .data
                .first()
                .and_then(|row| row.first())
                .and_then(cell_to_string);
            TestConnectionResult {
                ok: true,
                message: msg,
            }
        }
        Err(e) => TestConnectionResult {
            ok: false,
            message: Some(e.to_string()),
        },
    }
}

pub async fn list_databases(conn: &Connection) -> Result<Vec<Database>, DataSourceError> {
    let resp = execute_sql(conn, None, "SHOW DATABASES").await?;

    let name_idx = column_index(&resp.column_meta, "name");
    let retention_idx = column_index(&resp.column_meta, "retention")
        .or_else(|| column_index(&resp.column_meta, "retentions"));
    let vgroups_idx = column_index(&resp.column_meta, "vgroups");
    let precision_idx = column_index(&resp.column_meta, "precision");

    let Some(name_idx) = name_idx else {
        return Ok(vec![]);
    };

    let mut out: Vec<Database> = Vec::with_capacity(resp.data.len());
    for row in &resp.data {
        let Some(name) = row.get(name_idx).and_then(cell_to_string) else {
            continue;
        };
        if SYSTEM_DATABASES.contains(&name.as_str()) {
            continue;
        }
        out.push(Database {
            name,
            retention: retention_idx
                .and_then(|i| row.get(i))
                .and_then(cell_to_string),
            vgroups: vgroups_idx.and_then(|i| row.get(i)).and_then(cell_to_u32),
            precision: precision_idx
                .and_then(|i| row.get(i))
                .and_then(cell_to_string),
        });
    }
    Ok(out)
}

pub async fn list_stables(
    conn: &Connection,
    db: &str,
) -> Result<Vec<STable>, DataSourceError> {
    let show_sql = format!("SHOW STABLES FROM {}", ident(db));
    let resp = execute_sql(conn, None, &show_sql).await?;

    let name_idx = column_index(&resp.column_meta, "stable_name")
        .or_else(|| column_index(&resp.column_meta, "name"));

    let Some(name_idx) = name_idx else {
        return Ok(vec![]);
    };

    let mut names: Vec<String> = Vec::new();
    for row in &resp.data {
        if let Some(name) = row.get(name_idx).and_then(cell_to_string) {
            names.push(name);
        }
    }

    // One follow-up query to fetch child counts grouped by stable.
    let count_sql = format!(
        "SELECT stable_name, COUNT(*) AS c FROM information_schema.ins_tables \
         WHERE db_name = {} GROUP BY stable_name",
        sql_str(db)
    );
    let mut count_map: HashMap<String, u32> = HashMap::new();
    if let Ok(count_resp) = execute_sql(conn, None, &count_sql).await {
        let cn_idx = column_index(&count_resp.column_meta, "stable_name");
        let cc_idx = column_index(&count_resp.column_meta, "c")
            .or_else(|| column_index(&count_resp.column_meta, "count(*)"));
        if let (Some(cn_idx), Some(cc_idx)) = (cn_idx, cc_idx) {
            for row in &count_resp.data {
                let name = row.get(cn_idx).and_then(cell_to_string);
                let count = row.get(cc_idx).and_then(cell_to_u32);
                if let (Some(name), Some(count)) = (name, count) {
                    count_map.insert(name, count);
                }
            }
        }
    }

    let mut out: Vec<STable> = Vec::with_capacity(names.len());
    for name in names {
        let child_count = *count_map.get(&name).unwrap_or(&0);
        out.push(STable {
            name,
            columns: vec![],
            tag_columns: vec![],
            child_count,
        });
    }
    Ok(out)
}

pub async fn list_tables(
    conn: &Connection,
    db: &str,
    opts: &ListTablesOpts,
) -> Result<Paged<Table>, DataSourceError> {
    let page = opts.page.max(1);
    let page_size = opts.page_size.max(1);
    let offset = (page - 1) * page_size;

    if let Some(search) = &opts.search {
        if search.contains(';') {
            return Err(DataSourceError::Other(
                "invalid search character: ';'".into(),
            ));
        }
    }

    if let Some(stable) = &opts.stable {
        let where_clause = match &opts.search {
            Some(s) if !s.is_empty() => {
                format!(" WHERE TBNAME LIKE {}", sql_str(&format!("%{}%", s)))
            }
            _ => String::new(),
        };

        let items_sql = format!(
            "SELECT TBNAME FROM {}.{}{} LIMIT {} OFFSET {}",
            ident(db),
            ident(stable),
            where_clause,
            page_size,
            offset
        );
        let items_resp = execute_sql(conn, None, &items_sql).await?;
        let mut items: Vec<Table> = Vec::with_capacity(items_resp.data.len());
        for row in &items_resp.data {
            if let Some(name) = row.first().and_then(cell_to_string) {
                items.push(Table {
                    name,
                    is_child: true,
                    stable_name: Some(stable.clone()),
                });
            }
        }

        let count_sql = format!(
            "SELECT COUNT(*) FROM {}.{}{}",
            ident(db),
            ident(stable),
            where_clause
        );
        let total = match execute_sql(conn, None, &count_sql).await {
            Ok(resp) => resp
                .data
                .first()
                .and_then(|row| row.first())
                .and_then(cell_to_u32)
                .unwrap_or(0),
            Err(_) => items.len() as u32,
        };

        return Ok(Paged {
            items,
            total,
            page,
            page_size,
        });
    }

    // No stable filter: SHOW TABLES + client-side slice.
    let show_sql = format!("SHOW TABLES FROM {}", ident(db));
    let resp = execute_sql(conn, None, &show_sql).await?;

    let name_idx = column_index(&resp.column_meta, "table_name")
        .or_else(|| column_index(&resp.column_meta, "name"))
        .unwrap_or(0);
    let stable_idx = column_index(&resp.column_meta, "stable_name");

    let mut all: Vec<Table> = Vec::with_capacity(resp.data.len());
    for row in &resp.data {
        let Some(name) = row.get(name_idx).and_then(cell_to_string) else {
            continue;
        };
        let parent = stable_idx.and_then(|i| row.get(i)).and_then(cell_to_string);
        let is_child = parent.as_ref().is_some_and(|p| !p.is_empty());
        if let Some(search) = &opts.search {
            if !search.is_empty() && !name.contains(search.as_str()) {
                continue;
            }
        }
        all.push(Table {
            name,
            is_child,
            stable_name: parent.filter(|p| !p.is_empty()),
        });
    }

    let total = all.len() as u32;
    let slice: Vec<Table> = all
        .into_iter()
        .skip(offset as usize)
        .take(page_size as usize)
        .collect();
    Ok(Paged {
        items: slice,
        total,
        page,
        page_size,
    })
}

pub async fn describe_table(
    conn: &Connection,
    db: &str,
    table: &str,
) -> Result<Vec<Column>, DataSourceError> {
    let sql = format!("DESCRIBE {}.{}", ident(db), ident(table));
    let resp = execute_sql(conn, None, &sql).await?;

    let field_idx = column_index(&resp.column_meta, "field").unwrap_or(0);
    let type_idx = column_index(&resp.column_meta, "type").unwrap_or(1);
    let length_idx = column_index(&resp.column_meta, "length");
    let note_idx = column_index(&resp.column_meta, "note");

    let mut out: Vec<Column> = Vec::with_capacity(resp.data.len());
    for (idx, row) in resp.data.iter().enumerate() {
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
    Ok(out)
}

pub async fn run_sql(
    conn: &Connection,
    db: Option<&str>,
    sql: &str,
) -> Result<QueryResult, DataSourceError> {
    let start = Instant::now();
    let resp = execute_sql(conn, db, sql).await?;
    let elapsed_ms = start.elapsed().as_millis() as u32;
    Ok(QueryResult {
        columns: parse_columns(&resp.column_meta),
        rows: resp.data,
        row_count: resp.rows,
        elapsed_ms,
        truncated: false,
    })
}
