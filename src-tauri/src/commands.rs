// Thin Tauri command wrappers.
//
// 7 schema/query commands (test_connection, test_connection_config,
// list_databases, list_stables, list_tables, describe_table, run_sql) route
// through the HTTP REST client and are `async`. Each one takes a *short* lock
// on MockState just long enough to clone the Connection out, releases the
// lock, then performs the async HTTP work.
//
// The remaining 15 commands (connections CRUD, scratch / consoles / result /
// history) keep their synchronous in-memory MockState behavior — `add-sqlite-
// persistence` will eventually swap that storage layer.

use std::sync::Mutex;

use tauri::State;

use crate::datasource::error::DataSourceError;
use crate::datasource::http_client;
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

fn clone_connection(
    state: &Mutex<MockState>,
    conn_id: &str,
) -> Result<Connection, DataSourceError> {
    let s = state.lock().unwrap();
    s.connections
        .iter()
        .find(|c| c.id == conn_id)
        .cloned()
        .ok_or_else(|| {
            DataSourceError::NotFound(format!("Connection not found: {}", conn_id))
        })
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
pub async fn test_connection(
    state: State<'_, Mutex<MockState>>,
    conn_id: String,
) -> Result<TestConnectionResult, DataSourceError> {
    let conn = clone_connection(&state, &conn_id)?;
    Ok(http_client::test_connection(&conn).await)
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
pub async fn test_connection_config(
    input: ConnectionInput,
) -> Result<TestConnectionResult, DataSourceError> {
    let conn = Connection {
        id: String::new(),
        name: input.name,
        host: input.host,
        port: input.port,
        user: input.user,
        password: input.password,
        color: input.color,
        status: ConnectionStatus::Online,
    };
    Ok(http_client::test_connection(&conn).await)
}

// ── Schema (HTTP-backed) ────────────────────────────────────────────────

#[tauri::command]
pub async fn list_databases(
    state: State<'_, Mutex<MockState>>,
    conn_id: String,
) -> Result<Vec<Database>, DataSourceError> {
    let conn = clone_connection(&state, &conn_id)?;
    http_client::list_databases(&conn).await
}

#[tauri::command]
pub async fn list_stables(
    state: State<'_, Mutex<MockState>>,
    conn_id: String,
    db: String,
) -> Result<Vec<STable>, DataSourceError> {
    let conn = clone_connection(&state, &conn_id)?;
    http_client::list_stables(&conn, &db).await
}

#[tauri::command]
pub async fn list_tables(
    state: State<'_, Mutex<MockState>>,
    conn_id: String,
    db: String,
    opts: ListTablesOpts,
) -> Result<Paged<Table>, DataSourceError> {
    let conn = clone_connection(&state, &conn_id)?;
    http_client::list_tables(&conn, &db, &opts).await
}

#[tauri::command]
pub async fn describe_table(
    state: State<'_, Mutex<MockState>>,
    conn_id: String,
    db: String,
    table: String,
) -> Result<Vec<Column>, DataSourceError> {
    let conn = clone_connection(&state, &conn_id)?;
    http_client::describe_table(&conn, &db, &table).await
}

// ── SQL execution (HTTP-backed) ─────────────────────────────────────────

#[tauri::command]
pub async fn run_sql(
    state: State<'_, Mutex<MockState>>,
    conn_id: String,
    db: Option<String>,
    sql: String,
) -> Result<QueryResult, DataSourceError> {
    let conn = clone_connection(&state, &conn_id)?;
    http_client::run_sql(&conn, db.as_deref(), &sql).await
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
        None => crate::datasource::mock::MockBackend::next_console_name(
            &s,
            &input.connection_id,
        ),
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
