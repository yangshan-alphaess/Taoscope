// TDengine 3.x WebSocket client built on the official `taos` crate
// (feature `ws-rustls`).
//
// `taos::TaosBuilder` parses a DSN of the form `ws://user:pass@host:port` (or
// `wss://...` when `Connection.protocol == Https`) and yields a `Taos` handle
// that internally manages the WebSocket connection, frame multiplexing, and
// binary block decoding. We translate each of our seven schema/query
// operations into the trait methods exposed by `AsyncQueryable` +
// `AsyncFetchable`, mapping their results into the same Rust types the
// HTTP REST client uses — so callers above this layer never see a
// transport-shaped difference.

use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use serde_json::Value as JsonValue;
use taos::taos_query::common::Value as TaosValue;
use taos::{AsyncFetchable, AsyncQueryable, AsyncTBuilder, TaosBuilder};
use std::sync::Mutex;

use crate::datasource::error::DataSourceError;
use crate::datasource::sql_builder::{
    build_count_child_tables_sql, build_count_normal_tables_sql, build_count_stables_sql,
    build_describe_sql, build_list_child_tables_sql, build_list_normal_tables_sql,
    SQL_SHOW_DATABASES, SQL_SHOW_STABLES, SYSTEM_DATABASES,
};
use crate::datasource::types::{
    AuthMode, Column, Connection, Database, ListTablesOpts, Paged, Protocol, QueryResult, STable,
    Table, TestConnectionResult,
};

// ── Connection pool ─────────────────────────────────────────────────────

static POOL: OnceLock<Mutex<HashMap<String, std::sync::Arc<taos::Taos>>>> = OnceLock::new();

fn pool() -> &'static Mutex<HashMap<String, std::sync::Arc<taos::Taos>>> {
    POOL.get_or_init(|| Mutex::new(HashMap::new()))
}

fn dsn_for(conn: &Connection) -> String {
    let scheme = match conn.protocol {
        Protocol::Https => "wss",
        Protocol::Http => "ws",
    };
    let user = urlencoding::encode(&conn.user);
    let creds = match conn.auth_mode {
        AuthMode::Basic => {
            let pwd = urlencoding::encode(&conn.password);
            format!("{}:{}@", user, pwd)
        }
        AuthMode::Token => {
            // Token authentication is appended as a query string per
            // TDengine Cloud's DSN convention.
            user.to_string() + "@"
        }
    };
    let base = format!("{}://{}{}:{}", scheme, creds, conn.host, conn.port);
    match conn.auth_mode {
        AuthMode::Token => {
            let token = conn.token.as_deref().unwrap_or("");
            format!("{}?token={}", base, urlencoding::encode(token))
        }
        AuthMode::Basic => base,
    }
}

fn pool_key(conn: &Connection) -> String {
    if !conn.id.is_empty() {
        conn.id.clone()
    } else {
        // Synthesise a fingerprint for the ephemeral "Test connection" case.
        format!(
            "test::{}::{}::{}",
            conn.host, conn.port, conn.user
        )
    }
}

async fn get_or_connect(conn: &Connection) -> Result<std::sync::Arc<taos::Taos>, DataSourceError> {
    let key = pool_key(conn);
    {
        let cache = pool().lock().unwrap();
        if let Some(taos) = cache.get(&key) {
            return Ok(taos.clone());
        }
    }
    let dsn = dsn_for(conn);
    let builder = TaosBuilder::from_dsn(&dsn)
        .map_err(|e| DataSourceError::Other(format!("ws DSN error: {}", e)))?;
    let taos = builder.build().await.map_err(map_err)?;
    let arc = std::sync::Arc::new(taos);
    let mut cache = pool().lock().unwrap();
    cache.insert(key, arc.clone());
    Ok(arc)
}

fn map_err(e: taos::Error) -> DataSourceError {
    let msg = e.to_string();
    let lower = msg.to_ascii_lowercase();
    if lower.contains("auth") || lower.contains("password") || lower.contains("401") {
        DataSourceError::Auth(msg)
    } else if lower.contains("network")
        || lower.contains("connect")
        || lower.contains("websocket")
        || lower.contains("timeout")
    {
        DataSourceError::Network(msg)
    } else {
        DataSourceError::Sql(msg)
    }
}

/// Drop the cached `Taos` for a given connection id (called on update / delete).
pub fn forget(conn_id: &str) {
    if conn_id.is_empty() {
        return;
    }
    let mut cache = pool().lock().unwrap();
    cache.remove(conn_id);
}

// ── Value conversion ────────────────────────────────────────────────────

fn taos_value_to_json(v: TaosValue) -> JsonValue {
    // `taos_query::common::Value` derives Serialize, so serde_json::to_value
    // gives us a stable JSON representation that mirrors the REST envelope.
    serde_json::to_value(v).unwrap_or(JsonValue::Null)
}

struct ResultRows {
    columns: Vec<Column>,
    rows: Vec<Vec<JsonValue>>,
    row_count: u32,
}

async fn run_inner(
    taos: &taos::Taos,
    db: Option<&str>,
    sql: &str,
) -> Result<ResultRows, DataSourceError> {
    if let Some(d) = db {
        let use_sql = format!("USE `{}`", d.replace('`', "``"));
        let _ = AsyncQueryable::exec(taos, &use_sql)
            .await
            .map_err(map_err)?;
    }
    let mut rs = AsyncQueryable::query(taos, sql).await.map_err(map_err)?;

    let fields = rs.fields();
    let columns: Vec<Column> = fields
        .iter()
        .map(|f| Column {
            name: f.name().to_string(),
            data_type: f.ty().name().to_string(),
            length: {
                let bytes = f.bytes();
                if bytes > 0 {
                    Some(bytes as u32)
                } else {
                    None
                }
            },
            is_tag: None,
            is_primary_ts: None,
        })
        .collect();

    let records = rs.to_records().await.map_err(map_err)?;
    let mut rows: Vec<Vec<JsonValue>> = Vec::with_capacity(records.len());
    for row in records {
        rows.push(row.into_iter().map(taos_value_to_json).collect());
    }
    let row_count = rows.len() as u32;
    Ok(ResultRows {
        columns,
        rows,
        row_count,
    })
}

async fn run(
    taos: &taos::Taos,
    timeout_ms: u32,
    db: Option<&str>,
    sql: &str,
) -> Result<ResultRows, DataSourceError> {
    match tokio::time::timeout(
        Duration::from_millis(timeout_ms as u64),
        run_inner(taos, db, sql),
    )
    .await
    {
        Ok(res) => res,
        Err(_) => Err(DataSourceError::Other(format!(
            "Query timeout after {}ms",
            timeout_ms
        ))),
    }
}

fn effective_timeout(conn: &Connection) -> u32 {
    conn.timeout_ms
        .unwrap_or(crate::datasource::http_client::DEFAULT_TIMEOUT_MS)
}

// ── Public methods ──────────────────────────────────────────────────────

pub async fn test_connection(conn: &Connection) -> TestConnectionResult {
    match get_or_connect(conn).await {
        Ok(taos) => match AsyncQueryable::server_version(taos.as_ref()).await {
            Ok(v) => TestConnectionResult {
                ok: true,
                message: Some(v.into_owned()),
            },
            Err(e) => TestConnectionResult {
                ok: false,
                message: Some(map_err(e).to_string()),
            },
        },
        Err(e) => TestConnectionResult {
            ok: false,
            message: Some(e.to_string()),
        },
    }
}

pub async fn list_databases(conn: &Connection) -> Result<Vec<Database>, DataSourceError> {
    let taos = get_or_connect(conn).await?;
    let timeout_ms = effective_timeout(conn);
    let result = run(&taos, timeout_ms, None, SQL_SHOW_DATABASES).await?;
    let name_idx = column_index(&result.columns, "name");
    let retention_idx = column_index(&result.columns, "retention")
        .or_else(|| column_index(&result.columns, "retentions"));
    let vgroups_idx = column_index(&result.columns, "vgroups");
    let precision_idx = column_index(&result.columns, "precision");

    let Some(name_idx) = name_idx else {
        return Ok(vec![]);
    };

    let mut out: Vec<Database> = Vec::with_capacity(result.rows.len());
    for row in &result.rows {
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
    let taos = get_or_connect(conn).await?;
    let timeout_ms = effective_timeout(conn);
    let result = run(&taos, timeout_ms, Some(db), SQL_SHOW_STABLES).await?;
    let name_idx = column_index(&result.columns, "stable_name")
        .or_else(|| column_index(&result.columns, "name"));
    let Some(name_idx) = name_idx else {
        return Ok(vec![]);
    };
    let mut names: Vec<String> = Vec::new();
    for row in &result.rows {
        if let Some(name) = row.get(name_idx).and_then(cell_to_string) {
            names.push(name);
        }
    }

    let count_sql = build_count_stables_sql(db);
    let mut count_map: HashMap<String, u32> = HashMap::new();
    if let Ok(count_resp) = run(&taos, timeout_ms, None, &count_sql).await {
        let cn_idx = column_index(&count_resp.columns, "stable_name");
        let cc_idx = column_index(&count_resp.columns, "c")
            .or_else(|| column_index(&count_resp.columns, "count(*)"));
        if let (Some(cn_idx), Some(cc_idx)) = (cn_idx, cc_idx) {
            for row in &count_resp.rows {
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

    let taos = get_or_connect(conn).await?;
    let timeout_ms = effective_timeout(conn);

    if let Some(stable) = &opts.stable {
        let items_sql =
            build_list_child_tables_sql(db, stable, opts.search.as_deref(), page_size, offset);
        let items_resp = run(&taos, timeout_ms, None, &items_sql).await?;
        let mut items: Vec<Table> = Vec::with_capacity(items_resp.rows.len());
        for row in &items_resp.rows {
            if let Some(name) = row.first().and_then(cell_to_string) {
                items.push(Table {
                    name,
                    is_child: true,
                    stable_name: Some(stable.clone()),
                });
            }
        }
        let count_sql =
            build_count_child_tables_sql(db, stable, opts.search.as_deref());
        let total = match run(&taos, timeout_ms, None, &count_sql).await {
            Ok(resp) => resp
                .rows
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

    let items_sql =
        build_list_normal_tables_sql(db, opts.search.as_deref(), page_size, offset);
    let items_resp = run(&taos, timeout_ms, None, &items_sql).await?;
    let mut items: Vec<Table> = Vec::with_capacity(items_resp.rows.len());
    for row in &items_resp.rows {
        if let Some(name) = row.first().and_then(cell_to_string) {
            items.push(Table {
                name,
                is_child: false,
                stable_name: None,
            });
        }
    }

    let count_sql = build_count_normal_tables_sql(db, opts.search.as_deref());
    let total = match run(&taos, timeout_ms, None, &count_sql).await {
        Ok(resp) => resp
            .rows
            .first()
            .and_then(|row| row.first())
            .and_then(cell_to_u32)
            .unwrap_or(0),
        Err(_) => items.len() as u32,
    };
    Ok(Paged {
        items,
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
    let taos = get_or_connect(conn).await?;
    let timeout_ms = effective_timeout(conn);
    let sql = build_describe_sql(db, table);
    let result = run(&taos, timeout_ms, None, &sql).await?;

    let field_idx = column_index(&result.columns, "field").unwrap_or(0);
    let type_idx = column_index(&result.columns, "type").unwrap_or(1);
    let length_idx = column_index(&result.columns, "length");
    let note_idx = column_index(&result.columns, "note");

    let mut out: Vec<Column> = Vec::with_capacity(result.rows.len());
    for (idx, row) in result.rows.iter().enumerate() {
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
    let taos = get_or_connect(conn).await?;
    let timeout_ms = effective_timeout(conn);
    let start = Instant::now();
    let result = run(&taos, timeout_ms, db, sql).await?;
    let elapsed_ms = start.elapsed().as_millis() as u32;
    Ok(QueryResult {
        columns: result.columns,
        rows: result.rows,
        row_count: result.row_count,
        elapsed_ms,
        truncated: false,
    })
}

// ── Local helpers (operate on our `Column` shape, not column_meta tuples) ──

fn column_index(columns: &[Column], name: &str) -> Option<usize> {
    columns.iter().position(|c| c.name.eq_ignore_ascii_case(name))
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
