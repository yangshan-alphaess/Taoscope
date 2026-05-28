// TDengine 3.x HTTP REST client.
//
// All 7 schema/query methods route through `execute_sql()` which POSTs raw SQL
// to TDengine's REST endpoint and parses the `{code, desc, column_meta, data,
// rows}` envelope. A process-wide `OnceLock<reqwest::Client>` reuses TCP /
// TLS pools across invocations.

use std::sync::OnceLock;
use std::time::{Duration, Instant};

use base64::engine::general_purpose;
use base64::Engine as _;
use reqwest::Client;
use serde::Deserialize;
use serde_json::Value as JsonValue;

use crate::datasource::error::DataSourceError;
use crate::datasource::sql_builder::{
    assemble_stables, build_count_child_tables_sql, build_count_normal_tables_sql,
    build_describe_sql, build_list_child_tables_sql, build_list_normal_tables_sql, cell_to_string,
    cell_to_u32, derive_total_from_short_page, parse_columns, parse_databases, parse_describe,
    parse_first_column_strings, parse_scalar_count, parse_stable_names, SQL_SERVER_VERSION,
    SQL_SHOW_DATABASES, SQL_SHOW_STABLES,
};
use crate::datasource::types::{
    AuthMode, Column, Connection, CountTablesOpts, Database, ListTablesOpts, Paged, QueryResult,
    STable, Table, TestConnectionResult,
};

/// Default per-request timeout for HTTP REST calls; `Connection.timeout_ms`
/// overrides per call.
pub const DEFAULT_TIMEOUT_MS: u32 = 30_000;

static STRICT_CLIENT: OnceLock<Client> = OnceLock::new();
static LAX_CLIENT: OnceLock<Client> = OnceLock::new();

fn build_client(accept_invalid_certs: bool) -> Client {
    Client::builder()
        .user_agent("Taoscope/0.1")
        .pool_idle_timeout(Duration::from_secs(90))
        .danger_accept_invalid_certs(accept_invalid_certs)
        .build()
        .expect("failed to build reqwest client")
}

fn http_client(allow_invalid_certs: bool) -> &'static Client {
    if allow_invalid_certs {
        LAX_CLIENT.get_or_init(|| build_client(true))
    } else {
        STRICT_CLIENT.get_or_init(|| build_client(false))
    }
}

fn endpoint(conn: &Connection, db: Option<&str>) -> String {
    let scheme = conn.protocol.as_str();
    match db {
        Some(d) => format!(
            "{}://{}:{}/rest/sql/{}",
            scheme,
            conn.host,
            conn.port,
            urlencoding::encode(d)
        ),
        None => format!("{}://{}:{}/rest/sql", scheme, conn.host, conn.port),
    }
}

fn auth_header(conn: &Connection) -> String {
    match conn.auth_mode {
        AuthMode::Basic => {
            let credentials = format!("{}:{}", conn.user, conn.password);
            format!("Basic {}", general_purpose::STANDARD.encode(credentials))
        }
        AuthMode::Token => {
            let token = conn.token.as_deref().unwrap_or("");
            format!("Taosd {}", token)
        }
    }
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
    let timeout_ms = conn.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS);
    let resp = http_client(conn.allow_invalid_certs)
        .post(endpoint(conn, db))
        .header("Authorization", auth_header(conn))
        .header("Content-Type", "text/plain")
        .timeout(Duration::from_millis(timeout_ms as u64))
        .body(sql.to_string())
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                DataSourceError::Other(format!("Query timeout after {}ms", timeout_ms))
            } else {
                DataSourceError::Network(e.to_string())
            }
        })?;

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

// ── Public methods ──────────────────────────────────────────────────────

pub async fn test_connection(conn: &Connection) -> TestConnectionResult {
    match execute_sql(conn, None, SQL_SERVER_VERSION).await {
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
    let resp = execute_sql(conn, None, SQL_SHOW_DATABASES).await?;
    let columns = parse_columns(&resp.column_meta);
    Ok(parse_databases(&columns, &resp.data))
}

pub async fn list_stables(
    conn: &Connection,
    db: &str,
) -> Result<Vec<STable>, DataSourceError> {
    // TDengine 3.x does NOT accept `SHOW STABLES FROM <db>` (MySQL-style).
    // Route the SQL through the REST path /rest/sql/<db> so `SHOW STABLES`
    // resolves against the named db.
    let resp = execute_sql(conn, Some(db), SQL_SHOW_STABLES).await?;
    let columns = parse_columns(&resp.column_meta);
    let names = parse_stable_names(&columns, &resp.data);
    Ok(assemble_stables(names))
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
        // Query metadata, not the underlying time-series. `SELECT TBNAME FROM
        // <db>.<stable>` iterates over every data row in every child table and
        // emits TBNAME for each — yielding massive duplication. The metadata
        // table `information_schema.ins_tables` has one row per table.
        let items_sql = build_list_child_tables_sql(
            db,
            stable,
            opts.search.as_deref(),
            page_size,
            offset,
        );
        let items_resp = execute_sql(conn, None, &items_sql).await?;
        let items: Vec<Table> = parse_first_column_strings(&items_resp.data)
            .into_iter()
            .map(|name| Table {
                name,
                is_child: true,
                stable_name: Some(stable.clone()),
            })
            .collect();

        let total = derive_total_from_short_page(items.len() as u32, page_size, offset);

        return Ok(Paged {
            items,
            total,
            page,
            page_size,
        });
    }

    // No stable filter: list only non-child (NORMAL_TABLE) tables in the db.
    // `SHOW TABLES` returns every table including child tables, and TDengine
    // versions differ on whether the `stable_name` column is even present
    // — making client-side `is_child` detection unreliable. Query the
    // metadata view directly for unambiguous filtering.
    let items_sql =
        build_list_normal_tables_sql(db, opts.search.as_deref(), page_size, offset);
    let items_resp = execute_sql(conn, None, &items_sql).await?;
    let items: Vec<Table> = parse_first_column_strings(&items_resp.data)
        .into_iter()
        .map(|name| Table {
            name,
            is_child: false,
            stable_name: None,
        })
        .collect();

    let total = derive_total_from_short_page(items.len() as u32, page_size, offset);

    Ok(Paged {
        items,
        total,
        page,
        page_size,
    })
}

/// Run only the `COUNT(*)` query for child / normal tables (mirrors the ws
/// client's `count_tables`). Returns 0 when the count cell can't be parsed.
pub async fn count_tables(
    conn: &Connection,
    db: &str,
    opts: &CountTablesOpts,
) -> Result<u32, DataSourceError> {
    if let Some(search) = &opts.search {
        if search.contains(';') {
            return Err(DataSourceError::Other(
                "invalid search character: ';'".into(),
            ));
        }
    }
    let sql = match &opts.stable {
        Some(stable) => build_count_child_tables_sql(db, stable, opts.search.as_deref()),
        None => build_count_normal_tables_sql(db, opts.search.as_deref()),
    };
    let resp = execute_sql(conn, None, &sql).await?;
    Ok(parse_scalar_count(&resp.data).unwrap_or(0))
}

pub async fn describe_table(
    conn: &Connection,
    db: &str,
    table: &str,
) -> Result<Vec<Column>, DataSourceError> {
    let sql = build_describe_sql(db, table);
    let resp = execute_sql(conn, None, &sql).await?;
    let columns = parse_columns(&resp.column_meta);
    Ok(parse_describe(&columns, &resp.data))
}

pub async fn run_sql(
    conn: &Connection,
    db: Option<&str>,
    sql: &str,
) -> Result<QueryResult, DataSourceError> {
    let start = Instant::now();
    let resp = execute_sql(conn, db, sql).await?;
    let elapsed_ms = start.elapsed().as_millis() as u32;

    // Write/DDL statements return a single `affected_rows` cell rather than a
    // result set. Detect that shape and surface it as `affected_rows` with an
    // empty grid. The single-cell guard (rows==1, one column, one value)
    // avoids misclassifying a SELECT of a column literally named
    // `affected_rows`.
    if resp.column_meta.len() == 1
        && resp.column_meta[0].0.eq_ignore_ascii_case("affected_rows")
        && resp.rows == 1
        && resp.data.len() == 1
        && resp.data[0].len() == 1
    {
        let affected = cell_to_u32(&resp.data[0][0]).unwrap_or(0);
        return Ok(QueryResult {
            columns: vec![],
            rows: vec![],
            row_count: 0,
            elapsed_ms,
            truncated: false,
            affected_rows: Some(affected),
        });
    }

    Ok(QueryResult {
        columns: parse_columns(&resp.column_meta),
        rows: resp.data,
        row_count: resp.rows,
        elapsed_ms,
        truncated: false,
        affected_rows: None,
    })
}
