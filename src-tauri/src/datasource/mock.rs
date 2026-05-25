// Mock backend: seeds and pure helper functions.
//
// Mirrors the TypeScript MockDataSource (src/datasource/mock.ts) 1:1 in
// semantics. Persistence is in-memory only; restart resets to seed.

use rand::Rng;
use regex::Regex;
use serde_json::Value as JsonValue;

use crate::datasource::state::MockState;
use crate::datasource::types::{
    Column, Connection, ConnectionInput, ConnectionStatus, Database,
    ListTablesOpts, Paged, QueryResult, STable, Table, TestConnectionResult,
};

// ── Seed connections ────────────────────────────────────────────────────

pub fn seed_connections() -> Vec<Connection> {
    vec![
        Connection {
            id: nanoid::nanoid!(),
            name: "prod-shanghai".into(),
            host: "192.168.10.20".into(),
            port: 6041,
            user: "root".into(),
            password: "".into(),
            color: None,
            status: ConnectionStatus::Online,
        },
        Connection {
            id: nanoid::nanoid!(),
            name: "staging-bj".into(),
            host: "10.0.3.15".into(),
            port: 6041,
            user: "dev".into(),
            password: "".into(),
            color: None,
            status: ConnectionStatus::Online,
        },
        Connection {
            id: nanoid::nanoid!(),
            name: "dev-local".into(),
            host: "127.0.0.1".into(),
            port: 6041,
            user: "root".into(),
            password: "".into(),
            color: None,
            status: ConnectionStatus::Offline,
        },
    ]
}

// ── Schema fixtures ─────────────────────────────────────────────────────

fn meters_stable() -> STable {
    STable {
        name: "meters".into(),
        columns: vec![
            Column {
                name: "ts".into(),
                data_type: "TIMESTAMP".into(),
                length: None,
                is_tag: None,
                is_primary_ts: Some(true),
            },
            Column {
                name: "current".into(),
                data_type: "FLOAT".into(),
                length: None,
                is_tag: None,
                is_primary_ts: None,
            },
            Column {
                name: "voltage".into(),
                data_type: "INT".into(),
                length: None,
                is_tag: None,
                is_primary_ts: None,
            },
            Column {
                name: "phase".into(),
                data_type: "FLOAT".into(),
                length: None,
                is_tag: None,
                is_primary_ts: None,
            },
        ],
        tag_columns: vec![
            Column {
                name: "location".into(),
                data_type: "BINARY".into(),
                length: Some(64),
                is_tag: Some(true),
                is_primary_ts: None,
            },
            Column {
                name: "groupId".into(),
                data_type: "INT".into(),
                length: None,
                is_tag: Some(true),
                is_primary_ts: None,
            },
        ],
        child_count: 3847,
    }
}

fn devices_stable() -> STable {
    STable {
        name: "devices".into(),
        columns: vec![
            Column {
                name: "ts".into(),
                data_type: "TIMESTAMP".into(),
                length: None,
                is_tag: None,
                is_primary_ts: Some(true),
            },
            Column {
                name: "online".into(),
                data_type: "BOOL".into(),
                length: None,
                is_tag: None,
                is_primary_ts: None,
            },
            Column {
                name: "uptime".into(),
                data_type: "BIGINT".into(),
                length: None,
                is_tag: None,
                is_primary_ts: None,
            },
        ],
        tag_columns: vec![
            Column {
                name: "model".into(),
                data_type: "NCHAR".into(),
                length: Some(32),
                is_tag: Some(true),
                is_primary_ts: None,
            },
            Column {
                name: "region".into(),
                data_type: "BINARY".into(),
                length: Some(32),
                is_tag: Some(true),
                is_primary_ts: None,
            },
        ],
        child_count: 128,
    }
}

fn app_logs_stable() -> STable {
    STable {
        name: "app_logs".into(),
        columns: vec![
            Column {
                name: "ts".into(),
                data_type: "TIMESTAMP".into(),
                length: None,
                is_tag: None,
                is_primary_ts: Some(true),
            },
            Column {
                name: "severity".into(),
                data_type: "TINYINT".into(),
                length: None,
                is_tag: None,
                is_primary_ts: None,
            },
            Column {
                name: "message".into(),
                data_type: "NCHAR".into(),
                length: Some(256),
                is_tag: None,
                is_primary_ts: None,
            },
        ],
        tag_columns: vec![
            Column {
                name: "app_name".into(),
                data_type: "BINARY".into(),
                length: Some(64),
                is_tag: Some(true),
                is_primary_ts: None,
            },
            Column {
                name: "host".into(),
                data_type: "BINARY".into(),
                length: Some(64),
                is_tag: Some(true),
                is_primary_ts: None,
            },
        ],
        child_count: 12,
    }
}

fn alerts_table() -> Table {
    Table {
        name: "alerts".into(),
        is_child: false,
        stable_name: None,
    }
}

fn alerts_columns() -> Vec<Column> {
    vec![
        Column {
            name: "ts".into(),
            data_type: "TIMESTAMP".into(),
            length: None,
            is_tag: None,
            is_primary_ts: Some(true),
        },
        Column {
            name: "level".into(),
            data_type: "INT".into(),
            length: None,
            is_tag: None,
            is_primary_ts: None,
        },
        Column {
            name: "code".into(),
            data_type: "BINARY".into(),
            length: Some(32),
            is_tag: None,
            is_primary_ts: None,
        },
        Column {
            name: "msg".into(),
            data_type: "NCHAR".into(),
            length: Some(128),
            is_tag: None,
            is_primary_ts: None,
        },
        Column {
            name: "acked".into(),
            data_type: "BOOL".into(),
            length: None,
            is_tag: None,
            is_primary_ts: None,
        },
    ]
}

fn online_databases() -> Vec<Database> {
    vec![
        Database {
            name: "iot_db".into(),
            retention: Some("14d".into()),
            vgroups: Some(4),
            precision: Some("ms".into()),
        },
        Database {
            name: "log_db".into(),
            retention: Some("7d".into()),
            vgroups: Some(2),
            precision: Some("ms".into()),
        },
        Database {
            name: "system".into(),
            retention: None,
            vgroups: None,
            precision: None,
        },
    ]
}

fn stables_for_db(db: &str) -> Vec<STable> {
    match db {
        "iot_db" => vec![meters_stable(), devices_stable()],
        "log_db" => vec![app_logs_stable()],
        _ => vec![],
    }
}

fn tables_for_db(db: &str) -> Vec<Table> {
    match db {
        "iot_db" => vec![alerts_table()],
        _ => vec![],
    }
}

fn child_name(index: u32) -> String {
    format!("d_{:0>6}", index)
}

// ── Demo query rows ─────────────────────────────────────────────────────

const DEMO_LOCATIONS: &[&str] = &["shanghai", "beijing", "guangzhou", "shenzhen"];

fn demo_columns() -> Vec<Column> {
    vec![
        Column {
            name: "ts".into(),
            data_type: "TIMESTAMP".into(),
            length: None,
            is_tag: None,
            is_primary_ts: Some(true),
        },
        Column {
            name: "current".into(),
            data_type: "FLOAT".into(),
            length: None,
            is_tag: None,
            is_primary_ts: None,
        },
        Column {
            name: "voltage".into(),
            data_type: "INT".into(),
            length: None,
            is_tag: None,
            is_primary_ts: None,
        },
        Column {
            name: "phase".into(),
            data_type: "FLOAT".into(),
            length: None,
            is_tag: None,
            is_primary_ts: None,
        },
        Column {
            name: "location".into(),
            data_type: "BINARY".into(),
            length: Some(64),
            is_tag: Some(true),
            is_primary_ts: None,
        },
        Column {
            name: "groupId".into(),
            data_type: "INT".into(),
            length: None,
            is_tag: Some(true),
            is_primary_ts: None,
        },
    ]
}

fn now_millis_i64() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn build_demo_rows(n: u32) -> Vec<Vec<JsonValue>> {
    let count = n.min(1001);
    let now = now_millis_i64();
    let mut rng = rand::thread_rng();
    let mut rows: Vec<Vec<JsonValue>> = Vec::with_capacity(count as usize);
    for i in 0..count {
        let ts = now - ((count - 1 - i) as i64) * 1000;
        let current = (rng.gen_range(8.5_f64..14.5_f64) * 100.0).round() / 100.0;
        let voltage: i32 = rng.gen_range(215..=232);
        let phase = (rng.gen_range(-0.5_f64..0.5_f64) * 1000.0).round() / 1000.0;
        let location = DEMO_LOCATIONS[(i as usize) % DEMO_LOCATIONS.len()];
        let group_id: i32 = rng.gen_range(1..=5);
        rows.push(vec![
            JsonValue::from(ts),
            JsonValue::from(current),
            JsonValue::from(voltage),
            JsonValue::from(phase),
            JsonValue::from(location),
            JsonValue::from(group_id),
        ]);
    }
    rows
}

// ── MockBackend pure functions ──────────────────────────────────────────

pub struct MockBackend;

impl MockBackend {
    pub fn list_databases(state: &MockState, conn_id: &str) -> Vec<Database> {
        if let Some(conn) = state.connections.iter().find(|c| c.id == conn_id) {
            if matches!(conn.status, ConnectionStatus::Offline) {
                return vec![];
            }
            return online_databases();
        }
        vec![]
    }

    pub fn list_stables(_conn_id: &str, db: &str) -> Vec<STable> {
        stables_for_db(db)
    }

    pub fn list_tables(
        _conn_id: &str,
        db: &str,
        opts: ListTablesOpts,
    ) -> Paged<Table> {
        let ListTablesOpts {
            stable,
            page,
            page_size,
            search,
        } = opts;
        let offset = ((page.saturating_sub(1)) * page_size) as usize;
        let page_size_usize = page_size as usize;

        if let Some(stb_name) = stable {
            let stables = stables_for_db(db);
            let stb = stables.iter().find(|s| s.name == stb_name);
            let Some(stb) = stb else {
                return Paged {
                    items: vec![],
                    total: 0,
                    page,
                    page_size,
                };
            };

            if let Some(q) = search.as_deref() {
                let mut matches: Vec<Table> = Vec::new();
                for i in 1..=stb.child_count {
                    let name = child_name(i);
                    if name.contains(q) {
                        matches.push(Table {
                            name,
                            is_child: true,
                            stable_name: Some(stb.name.clone()),
                        });
                    }
                }
                let total = matches.len() as u32;
                let slice: Vec<Table> = matches
                    .into_iter()
                    .skip(offset)
                    .take(page_size_usize)
                    .collect();
                return Paged {
                    items: slice,
                    total,
                    page,
                    page_size,
                };
            }

            let mut items: Vec<Table> = Vec::new();
            let start = offset as u32 + 1;
            let end = stb.child_count.min(offset as u32 + page_size);
            if start <= end {
                for i in start..=end {
                    items.push(Table {
                        name: child_name(i),
                        is_child: true,
                        stable_name: Some(stb.name.clone()),
                    });
                }
            }
            return Paged {
                items,
                total: stb.child_count,
                page,
                page_size,
            };
        }

        let all = tables_for_db(db);
        let filtered: Vec<Table> = match search.as_deref() {
            Some(q) => all.into_iter().filter(|t| t.name.contains(q)).collect(),
            None => all,
        };
        let total = filtered.len() as u32;
        let slice: Vec<Table> = filtered
            .into_iter()
            .skip(offset)
            .take(page_size_usize)
            .collect();
        Paged {
            items: slice,
            total,
            page,
            page_size,
        }
    }

    pub fn describe_table(_conn_id: &str, _db: &str, table: &str) -> Vec<Column> {
        match table {
            "meters" => {
                let stb = meters_stable();
                let mut out = stb.columns;
                out.extend(stb.tag_columns);
                out
            }
            "devices" => {
                let stb = devices_stable();
                let mut out = stb.columns;
                out.extend(stb.tag_columns);
                out
            }
            "app_logs" => {
                let stb = app_logs_stable();
                let mut out = stb.columns;
                out.extend(stb.tag_columns);
                out
            }
            "alerts" => alerts_columns(),
            name if name.starts_with("d_") => {
                let stb = meters_stable();
                let mut out = stb.columns;
                out.extend(stb.tag_columns);
                out
            }
            _ => vec![],
        }
    }

    pub fn run_sql(_conn_id: &str, _db: Option<&str>, sql: &str) -> QueryResult {
        let re = Regex::new(r"(?i)\bLIMIT\s+(\d+)").unwrap();
        let n: u32 = re
            .captures(sql)
            .and_then(|c| c.get(1))
            .and_then(|m| m.as_str().parse::<u32>().ok())
            .map(|n| n.min(1001))
            .unwrap_or(10);
        let rows = build_demo_rows(n);
        let row_count = rows.len() as u32;
        let mut rng = rand::thread_rng();
        let elapsed_ms: u32 = rng.gen_range(30..=80);
        QueryResult {
            columns: demo_columns(),
            rows,
            row_count,
            elapsed_ms,
            truncated: false,
        }
    }

    pub fn test_connection_config(input: &ConnectionInput) -> TestConnectionResult {
        let host = input.host.trim();
        if host.is_empty() || input.port < 1 {
            return TestConnectionResult {
                ok: false,
                message: Some("Invalid host or port".into()),
            };
        }
        let is_lan = host.starts_with("192.168.")
            || host.starts_with("10.")
            || host == "127.0.0.1"
            || host == "localhost";
        if is_lan {
            if rand::random::<bool>() {
                return TestConnectionResult {
                    ok: true,
                    message: None,
                };
            }
            return TestConnectionResult {
                ok: false,
                message: Some("ECONNREFUSED (mock LAN intermittent)".into()),
            };
        }
        TestConnectionResult {
            ok: true,
            message: None,
        }
    }

    /// Find the next auto-name "Console #N" for a given connection.
    pub fn next_console_name(state: &MockState, conn_id: &str) -> String {
        let re = Regex::new(r"^Console #(\d+)$").unwrap();
        let mut max: u32 = 0;
        for c in &state.consoles {
            if c.connection_id != conn_id {
                continue;
            }
            if let Some(cap) = re.captures(&c.name) {
                if let Some(n) = cap.get(1).and_then(|m| m.as_str().parse::<u32>().ok()) {
                    if n > max {
                        max = n;
                    }
                }
            }
        }
        format!("Console #{}", max + 1)
    }
}
