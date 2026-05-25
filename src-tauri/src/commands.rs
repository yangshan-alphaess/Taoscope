// Thin Tauri command wrappers around the Mock backend.
//
// All commands take `tauri::State<Mutex<MockState>>` (where state access is
// needed) plus business arguments. Each one locks state at function entry; the
// lock is released at scope exit. No command holds the lock across an await.

use std::sync::Mutex;

use tauri::State;

use crate::datasource::error::DataSourceError;
use crate::datasource::mock::MockBackend;
use crate::datasource::state::MockState;
use crate::datasource::types::{
    Column, Connection, ConnectionInput, ConnectionStatus, Console,
    CreateConsoleInput, Database, HistoryEntry, ListTablesOpts, Paged, QueryResult,
    STable, Table, TestConnectionResult,
};

fn now_millis() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// ── Connections ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_connections(
    state: State<'_, Mutex<MockState>>,
) -> Result<Vec<Connection>, DataSourceError> {
    let s = state.lock().unwrap();
    Ok(s.connections.clone())
}

#[tauri::command]
pub fn test_connection(
    state: State<'_, Mutex<MockState>>,
    conn_id: String,
) -> Result<TestConnectionResult, DataSourceError> {
    let s = state.lock().unwrap();
    match s.connections.iter().find(|c| c.id == conn_id) {
        None => Ok(TestConnectionResult {
            ok: false,
            message: Some(format!("Unknown connection: {}", conn_id)),
        }),
        Some(c) if matches!(c.status, ConnectionStatus::Offline) => Ok(TestConnectionResult {
            ok: false,
            message: Some("ECONNREFUSED".into()),
        }),
        Some(_) => Ok(TestConnectionResult {
            ok: true,
            message: None,
        }),
    }
}

#[tauri::command]
pub fn create_connection(
    state: State<'_, Mutex<MockState>>,
    input: ConnectionInput,
) -> Result<Connection, DataSourceError> {
    let mut s = state.lock().unwrap();
    let name = input.name.trim().to_string();
    if s.connections.iter().any(|c| c.name == name) {
        return Err(DataSourceError::AlreadyExists(format!(
            "Connection name '{}' already exists",
            name
        )));
    }
    let created = Connection {
        id: nanoid::nanoid!(),
        name,
        host: input.host,
        port: input.port,
        user: input.user,
        password: input.password,
        color: input.color,
        status: ConnectionStatus::Online,
    };
    s.connections.push(created.clone());
    Ok(created)
}

#[tauri::command]
pub fn update_connection(
    state: State<'_, Mutex<MockState>>,
    id: String,
    input: ConnectionInput,
) -> Result<(), DataSourceError> {
    let mut s = state.lock().unwrap();
    let name = input.name.trim().to_string();
    if s.connections.iter().any(|c| c.id != id && c.name == name) {
        return Err(DataSourceError::AlreadyExists(format!(
            "Connection name '{}' already exists",
            name
        )));
    }
    let idx = s
        .connections
        .iter()
        .position(|c| c.id == id)
        .ok_or_else(|| DataSourceError::NotFound(format!("Connection not found: {}", id)))?;
    let prev = s.connections[idx].clone();
    s.connections[idx] = Connection {
        id: prev.id,
        status: prev.status,
        name,
        host: input.host,
        port: input.port,
        user: input.user,
        password: input.password,
        color: input.color,
    };
    Ok(())
}

#[tauri::command]
pub fn delete_connection(
    state: State<'_, Mutex<MockState>>,
    id: String,
) -> Result<(), DataSourceError> {
    let mut s = state.lock().unwrap();
    s.connections.retain(|c| c.id != id);
    Ok(())
}

#[tauri::command]
pub fn test_connection_config(
    input: ConnectionInput,
) -> Result<TestConnectionResult, DataSourceError> {
    Ok(MockBackend::test_connection_config(&input))
}

// ── Schema ──────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_databases(
    state: State<'_, Mutex<MockState>>,
    conn_id: String,
) -> Result<Vec<Database>, DataSourceError> {
    let s = state.lock().unwrap();
    Ok(MockBackend::list_databases(&s, &conn_id))
}

#[tauri::command]
pub fn list_stables(
    state: State<'_, Mutex<MockState>>,
    conn_id: String,
    db: String,
) -> Result<Vec<STable>, DataSourceError> {
    let s = state.lock().unwrap();
    if let Some(c) = s.connections.iter().find(|c| c.id == conn_id) {
        if matches!(c.status, ConnectionStatus::Offline) {
            return Ok(vec![]);
        }
    }
    Ok(MockBackend::list_stables(&conn_id, &db))
}

#[tauri::command]
pub fn list_tables(
    state: State<'_, Mutex<MockState>>,
    conn_id: String,
    db: String,
    opts: ListTablesOpts,
) -> Result<Paged<Table>, DataSourceError> {
    let s = state.lock().unwrap();
    if let Some(c) = s.connections.iter().find(|c| c.id == conn_id) {
        if matches!(c.status, ConnectionStatus::Offline) {
            return Ok(Paged {
                items: vec![],
                total: 0,
                page: opts.page,
                page_size: opts.page_size,
            });
        }
    }
    Ok(MockBackend::list_tables(&conn_id, &db, opts))
}

#[tauri::command]
pub fn describe_table(
    conn_id: String,
    db: String,
    table: String,
) -> Result<Vec<Column>, DataSourceError> {
    Ok(MockBackend::describe_table(&conn_id, &db, &table))
}

// ── SQL execution ───────────────────────────────────────────────────────

#[tauri::command]
pub fn run_sql(
    conn_id: String,
    db: Option<String>,
    sql: String,
) -> Result<QueryResult, DataSourceError> {
    Ok(MockBackend::run_sql(&conn_id, db.as_deref(), &sql))
}

// ── Scratch ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn load_scratch(
    state: State<'_, Mutex<MockState>>,
    console_id: String,
) -> Result<String, DataSourceError> {
    let s = state.lock().unwrap();
    Ok(s.scratches.get(&console_id).cloned().unwrap_or_default())
}

#[tauri::command]
pub fn save_scratch(
    state: State<'_, Mutex<MockState>>,
    console_id: String,
    content: String,
) -> Result<(), DataSourceError> {
    let mut s = state.lock().unwrap();
    s.scratches.insert(console_id, content);
    Ok(())
}

// ── Consoles ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_consoles(
    state: State<'_, Mutex<MockState>>,
) -> Result<Vec<Console>, DataSourceError> {
    let s = state.lock().unwrap();
    Ok(s.consoles.clone())
}

#[tauri::command]
pub fn create_console(
    state: State<'_, Mutex<MockState>>,
    input: CreateConsoleInput,
) -> Result<Console, DataSourceError> {
    let mut s = state.lock().unwrap();
    let name = match input.name {
        Some(n) => n,
        None => MockBackend::next_console_name(&s, &input.connection_id),
    };
    let created = Console {
        id: nanoid::nanoid!(),
        name,
        connection_id: input.connection_id,
        current_db: None,
        created_at: now_millis(),
    };
    s.consoles.push(created.clone());
    Ok(created)
}

#[tauri::command]
pub fn rename_console(
    state: State<'_, Mutex<MockState>>,
    id: String,
    name: String,
) -> Result<(), DataSourceError> {
    let mut s = state.lock().unwrap();
    let target_idx = s
        .consoles
        .iter()
        .position(|c| c.id == id)
        .ok_or_else(|| DataSourceError::NotFound(format!("Console not found: {}", id)))?;
    let target_conn = s.consoles[target_idx].connection_id.clone();
    if s.consoles[target_idx].name == name {
        return Ok(());
    }
    let clash = s
        .consoles
        .iter()
        .any(|c| c.id != id && c.connection_id == target_conn && c.name == name);
    if clash {
        return Err(DataSourceError::AlreadyExists(format!(
            "Console name '{}' already exists",
            name
        )));
    }
    s.consoles[target_idx].name = name;
    Ok(())
}

#[tauri::command]
pub fn update_console_db(
    state: State<'_, Mutex<MockState>>,
    id: String,
    db: Option<String>,
) -> Result<(), DataSourceError> {
    let mut s = state.lock().unwrap();
    let idx = s
        .consoles
        .iter()
        .position(|c| c.id == id)
        .ok_or_else(|| DataSourceError::NotFound(format!("Console not found: {}", id)))?;
    s.consoles[idx].current_db = db;
    Ok(())
}

#[tauri::command]
pub fn delete_console(
    state: State<'_, Mutex<MockState>>,
    id: String,
) -> Result<(), DataSourceError> {
    let mut s = state.lock().unwrap();
    s.consoles.retain(|c| c.id != id);
    s.scratches.remove(&id);
    s.results.remove(&id);
    s.histories.remove(&id);
    Ok(())
}

// ── Result + history ────────────────────────────────────────────────────

#[tauri::command]
pub fn load_result(
    state: State<'_, Mutex<MockState>>,
    console_id: String,
) -> Result<Option<QueryResult>, DataSourceError> {
    let s = state.lock().unwrap();
    Ok(s.results.get(&console_id).cloned())
}

#[tauri::command]
pub fn save_result(
    state: State<'_, Mutex<MockState>>,
    console_id: String,
    result: QueryResult,
) -> Result<(), DataSourceError> {
    let mut s = state.lock().unwrap();
    s.results.insert(console_id, result);
    Ok(())
}

#[tauri::command]
pub fn load_history(
    state: State<'_, Mutex<MockState>>,
    console_id: String,
) -> Result<Vec<HistoryEntry>, DataSourceError> {
    let s = state.lock().unwrap();
    Ok(s.histories.get(&console_id).cloned().unwrap_or_default())
}

#[tauri::command]
pub fn save_history(
    state: State<'_, Mutex<MockState>>,
    console_id: String,
    entries: Vec<HistoryEntry>,
) -> Result<(), DataSourceError> {
    let mut s = state.lock().unwrap();
    s.histories.insert(console_id, entries);
    Ok(())
}
