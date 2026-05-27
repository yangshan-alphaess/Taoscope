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
    assemble_stables, build_count_child_tables_sql, build_count_normal_tables_sql,
    build_count_stables_sql, build_describe_sql, build_list_child_tables_sql,
    build_list_normal_tables_sql, parse_databases, parse_describe, parse_first_column_strings,
    parse_scalar_count, parse_stable_count_map, parse_stable_names, SQL_SHOW_DATABASES,
    SQL_SHOW_STABLES,
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
    /// `Some` for write/DDL statements (no fields); `None` for result sets.
    affected_rows: Option<u32>,
}

async fn run_inner(
    taos: &taos::Taos,
    db: Option<&str>,
    sql: &str,
) -> Result<ResultRows, DataSourceError> {
    if let Some(d) = db {
        // This `USE` result is discarded; the affected-rows detection below
        // only inspects the user statement's own ResultSet.
        let use_sql = format!("USE `{}`", d.replace('`', "``"));
        let _ = AsyncQueryable::exec(taos, &use_sql)
            .await
            .map_err(map_err)?;
    }
    let mut rs = AsyncQueryable::query(taos, sql).await.map_err(map_err)?;

    let fields = rs.fields();

    // Write/DDL statements produce a ResultSet with no fields; surface the
    // affected-row count instead of an (empty) result set.
    if fields.is_empty() {
        return Ok(ResultRows {
            columns: vec![],
            rows: vec![],
            row_count: 0,
            affected_rows: Some(rs.affected_rows() as u32),
        });
    }

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
        affected_rows: None,
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
    Ok(parse_databases(&result.columns, &result.rows))
}

pub async fn list_stables(
    conn: &Connection,
    db: &str,
) -> Result<Vec<STable>, DataSourceError> {
    let taos = get_or_connect(conn).await?;
    let timeout_ms = effective_timeout(conn);
    let result = run(&taos, timeout_ms, Some(db), SQL_SHOW_STABLES).await?;
    let names = parse_stable_names(&result.columns, &result.rows);

    let count_sql = build_count_stables_sql(db);
    let counts = match run(&taos, timeout_ms, None, &count_sql).await {
        Ok(count_resp) => parse_stable_count_map(&count_resp.columns, &count_resp.rows),
        Err(_) => HashMap::new(),
    };

    Ok(assemble_stables(names, &counts))
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
        let items: Vec<Table> = parse_first_column_strings(&items_resp.rows)
            .into_iter()
            .map(|name| Table {
                name,
                is_child: true,
                stable_name: Some(stable.clone()),
            })
            .collect();
        let count_sql =
            build_count_child_tables_sql(db, stable, opts.search.as_deref());
        let total = match run(&taos, timeout_ms, None, &count_sql).await {
            Ok(resp) => parse_scalar_count(&resp.rows).unwrap_or(0),
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
    let items: Vec<Table> = parse_first_column_strings(&items_resp.rows)
        .into_iter()
        .map(|name| Table {
            name,
            is_child: false,
            stable_name: None,
        })
        .collect();

    let count_sql = build_count_normal_tables_sql(db, opts.search.as_deref());
    let total = match run(&taos, timeout_ms, None, &count_sql).await {
        Ok(resp) => parse_scalar_count(&resp.rows).unwrap_or(0),
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
    Ok(parse_describe(&result.columns, &result.rows))
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
        affected_rows: result.affected_rows,
    })
}

