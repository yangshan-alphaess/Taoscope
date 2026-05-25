// Store: SQLite-backed persistence layer for application metadata.
//
// Holds a single `rusqlite::Connection` and exposes 15 domain methods that the
// Tauri commands in commands.rs delegate to. All connections / consoles /
// scratches / results / histories live in `<app_data_dir>/taoscope.db` and
// survive process restarts.

use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};

use crate::datasource::db;
use crate::datasource::error::DataSourceError;
use crate::datasource::types::{
    Connection as DsConnection, ConnectionInput, ConnectionStatus, Console as DsConsole,
    CreateConsoleInput, HistoryEntry, QueryResult,
};
use crate::datasource::vault;

pub struct Store {
    conn: Connection,
}

impl Store {
    pub fn open(path: &Path) -> Result<Self, DataSourceError> {
        let conn = Connection::open(path)
            .map_err(|e| DataSourceError::Other(format!("open db: {}", e)))?;
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(db::map_err)?;
        conn.pragma_update(None, "synchronous", "NORMAL")
            .map_err(db::map_err)?;
        conn.pragma_update(None, "foreign_keys", "OFF")
            .map_err(db::map_err)?;
        db::migrate(&conn)?;
        db::seed_if_empty(&conn)?;
        migrate_passwords_to_vault(&conn)?;
        Ok(Self { conn })
    }

    // ── Connections ─────────────────────────────────────────────────────

    pub fn list_connections(&self) -> Result<Vec<DsConnection>, DataSourceError> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, name, host, port, user, color, status \
                 FROM connections ORDER BY rowid",
            )
            .map_err(db::map_err)?;
        let rows = stmt
            .query_map([], row_to_connection_no_password)
            .map_err(db::map_err)?;
        let mut out = Vec::new();
        for r in rows {
            let mut c = r.map_err(db::map_err)?;
            c.password = vault::get_password(&c.id)?;
            out.push(c);
        }
        Ok(out)
    }

    pub fn get_connection(&self, id: &str) -> Result<DsConnection, DataSourceError> {
        let mut c = self
            .conn
            .query_row(
                "SELECT id, name, host, port, user, color, status \
                 FROM connections WHERE id = ?1",
                params![id],
                row_to_connection_no_password,
            )
            .optional()
            .map_err(db::map_err)?
            .ok_or_else(|| {
                DataSourceError::NotFound(format!("Connection not found: {}", id))
            })?;
        c.password = vault::get_password(&c.id)?;
        Ok(c)
    }

    pub fn create_connection(
        &mut self,
        input: ConnectionInput,
    ) -> Result<DsConnection, DataSourceError> {
        let name = input.name.trim().to_string();
        let id = nanoid::nanoid!();

        // 1. INSERT placeholder row with empty password column.
        self.conn
            .execute(
                "INSERT INTO connections (id, name, host, port, user, password, color, status) \
                 VALUES (?1, ?2, ?3, ?4, ?5, '', ?6, ?7)",
                params![
                    id,
                    name,
                    input.host,
                    input.port,
                    input.user,
                    input.color,
                    status_str(&ConnectionStatus::Online),
                ],
            )
            .map_err(|e| match db::map_err(e) {
                DataSourceError::AlreadyExists(_) => DataSourceError::AlreadyExists(format!(
                    "Connection name '{}' already exists",
                    name
                )),
                other => other,
            })?;

        // 2. Vault write; roll back the row if it fails.
        if let Err(e) = vault::set_password(&id, &input.password) {
            let _ = self
                .conn
                .execute("DELETE FROM connections WHERE id = ?1", params![id]);
            return Err(e);
        }

        Ok(DsConnection {
            id,
            name,
            host: input.host,
            port: input.port,
            user: input.user,
            password: input.password,
            color: input.color,
            status: ConnectionStatus::Online,
        })
    }

    pub fn update_connection(
        &mut self,
        id: &str,
        input: ConnectionInput,
    ) -> Result<(), DataSourceError> {
        // Verify connection exists (without touching the vault).
        let exists: i64 = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM connections WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .map_err(db::map_err)?;
        if exists == 0 {
            return Err(DataSourceError::NotFound(format!(
                "Connection not found: {}",
                id
            )));
        }

        let name = input.name.trim().to_string();
        // Keep the password column as the permanent "" placeholder.
        self.conn
            .execute(
                "UPDATE connections SET name = ?1, host = ?2, port = ?3, user = ?4, \
                 color = ?5 WHERE id = ?6",
                params![
                    name,
                    input.host,
                    input.port,
                    input.user,
                    input.color,
                    id,
                ],
            )
            .map_err(|e| match db::map_err(e) {
                DataSourceError::AlreadyExists(_) => DataSourceError::AlreadyExists(format!(
                    "Connection name '{}' already exists",
                    name
                )),
                other => other,
            })?;

        // Vault write is independent of the db UPDATE; on failure the toast
        // tells the user and they can retry.
        vault::set_password(id, &input.password)
    }

    pub fn delete_connection(&mut self, id: &str) -> Result<(), DataSourceError> {
        // Vault first; the missing-entry case is silent so this is safe even
        // for connections that never had a password set.
        vault::delete_password(id)?;
        self.conn
            .execute("DELETE FROM connections WHERE id = ?1", params![id])
            .map_err(db::map_err)?;
        Ok(())
    }

    // ── Consoles ────────────────────────────────────────────────────────

    pub fn list_consoles(&self) -> Result<Vec<DsConsole>, DataSourceError> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, name, connection_id, current_db, created_at \
                 FROM consoles ORDER BY rowid",
            )
            .map_err(db::map_err)?;
        let rows = stmt
            .query_map([], row_to_console)
            .map_err(db::map_err)?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(db::map_err)?);
        }
        Ok(out)
    }

    /// Returns the next auto-name "Console #N" for the given connection.
    pub fn next_console_name(&self, connection_id: &str) -> Result<String, DataSourceError> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT name FROM consoles WHERE connection_id = ?1",
            )
            .map_err(db::map_err)?;
        let rows = stmt
            .query_map(params![connection_id], |r| r.get::<_, String>(0))
            .map_err(db::map_err)?;
        let re = regex::Regex::new(r"^Console #(\d+)$").unwrap();
        let mut max: u32 = 0;
        for r in rows {
            let name = r.map_err(db::map_err)?;
            if let Some(cap) = re.captures(&name) {
                if let Some(n) = cap.get(1).and_then(|m| m.as_str().parse::<u32>().ok()) {
                    if n > max {
                        max = n;
                    }
                }
            }
        }
        Ok(format!("Console #{}", max + 1))
    }

    pub fn create_console(
        &mut self,
        input: CreateConsoleInput,
        now_ms: u64,
    ) -> Result<DsConsole, DataSourceError> {
        let name = match input.name {
            Some(n) => n,
            None => self.next_console_name(&input.connection_id)?,
        };
        let created = DsConsole {
            id: nanoid::nanoid!(),
            name,
            connection_id: input.connection_id,
            current_db: None,
            created_at: now_ms,
        };
        self.conn
            .execute(
                "INSERT INTO consoles (id, name, connection_id, current_db, created_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    created.id,
                    created.name,
                    created.connection_id,
                    created.current_db,
                    created.created_at as i64,
                ],
            )
            .map_err(|e| match db::map_err(e) {
                DataSourceError::AlreadyExists(_) => DataSourceError::AlreadyExists(format!(
                    "Console name '{}' already exists",
                    created.name
                )),
                other => other,
            })?;
        Ok(created)
    }

    pub fn rename_console(
        &mut self,
        id: &str,
        name: &str,
    ) -> Result<(), DataSourceError> {
        // Find the console first.
        let current: Option<(String, String)> = self
            .conn
            .query_row(
                "SELECT name, connection_id FROM consoles WHERE id = ?1",
                params![id],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
            )
            .optional()
            .map_err(db::map_err)?;
        let Some((current_name, _conn_id)) = current else {
            return Err(DataSourceError::NotFound(format!(
                "Console not found: {}",
                id
            )));
        };
        if current_name == name {
            return Ok(());
        }
        self.conn
            .execute(
                "UPDATE consoles SET name = ?1 WHERE id = ?2",
                params![name, id],
            )
            .map_err(|e| match db::map_err(e) {
                DataSourceError::AlreadyExists(_) => DataSourceError::AlreadyExists(format!(
                    "Console name '{}' already exists",
                    name
                )),
                other => other,
            })?;
        Ok(())
    }

    pub fn update_console_db(
        &mut self,
        id: &str,
        db: Option<&str>,
    ) -> Result<(), DataSourceError> {
        let affected = self
            .conn
            .execute(
                "UPDATE consoles SET current_db = ?1 WHERE id = ?2",
                params![db, id],
            )
            .map_err(db::map_err)?;
        if affected == 0 {
            return Err(DataSourceError::NotFound(format!(
                "Console not found: {}",
                id
            )));
        }
        Ok(())
    }

    pub fn delete_console(&mut self, id: &str) -> Result<(), DataSourceError> {
        let tx = self.conn.unchecked_transaction().map_err(db::map_err)?;
        tx.execute("DELETE FROM consoles WHERE id = ?1", params![id])
            .map_err(db::map_err)?;
        tx.execute(
            "DELETE FROM scratches WHERE console_id = ?1",
            params![id],
        )
        .map_err(db::map_err)?;
        tx.execute("DELETE FROM results WHERE console_id = ?1", params![id])
            .map_err(db::map_err)?;
        tx.execute(
            "DELETE FROM histories WHERE console_id = ?1",
            params![id],
        )
        .map_err(db::map_err)?;
        tx.commit().map_err(db::map_err)?;
        Ok(())
    }

    // ── Scratch / Result / History ──────────────────────────────────────

    pub fn load_scratch(&self, console_id: &str) -> Result<String, DataSourceError> {
        let out: Option<String> = self
            .conn
            .query_row(
                "SELECT content FROM scratches WHERE console_id = ?1",
                params![console_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(db::map_err)?;
        Ok(out.unwrap_or_default())
    }

    pub fn save_scratch(
        &mut self,
        console_id: &str,
        content: &str,
    ) -> Result<(), DataSourceError> {
        self.conn
            .execute(
                "INSERT INTO scratches (console_id, content) VALUES (?1, ?2) \
                 ON CONFLICT(console_id) DO UPDATE SET content = excluded.content",
                params![console_id, content],
            )
            .map_err(db::map_err)?;
        Ok(())
    }

    pub fn load_result(
        &self,
        console_id: &str,
    ) -> Result<Option<QueryResult>, DataSourceError> {
        let blob: Option<Vec<u8>> = self
            .conn
            .query_row(
                "SELECT payload FROM results WHERE console_id = ?1",
                params![console_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(db::map_err)?;
        match blob {
            None => Ok(None),
            Some(bytes) => {
                let parsed = serde_json::from_slice::<QueryResult>(&bytes)
                    .map_err(|e| DataSourceError::Other(format!("decode result: {}", e)))?;
                Ok(Some(parsed))
            }
        }
    }

    pub fn save_result(
        &mut self,
        console_id: &str,
        result: &QueryResult,
    ) -> Result<(), DataSourceError> {
        let payload = serde_json::to_vec(result)
            .map_err(|e| DataSourceError::Other(format!("encode result: {}", e)))?;
        self.conn
            .execute(
                "INSERT INTO results (console_id, payload) VALUES (?1, ?2) \
                 ON CONFLICT(console_id) DO UPDATE SET payload = excluded.payload",
                params![console_id, payload],
            )
            .map_err(db::map_err)?;
        Ok(())
    }

    pub fn load_history(
        &self,
        console_id: &str,
    ) -> Result<Vec<HistoryEntry>, DataSourceError> {
        let blob: Option<Vec<u8>> = self
            .conn
            .query_row(
                "SELECT entries FROM histories WHERE console_id = ?1",
                params![console_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(db::map_err)?;
        match blob {
            None => Ok(Vec::new()),
            Some(bytes) => serde_json::from_slice::<Vec<HistoryEntry>>(&bytes)
                .map_err(|e| DataSourceError::Other(format!("decode history: {}", e))),
        }
    }

    pub fn save_history(
        &mut self,
        console_id: &str,
        entries: &[HistoryEntry],
    ) -> Result<(), DataSourceError> {
        let payload = serde_json::to_vec(entries)
            .map_err(|e| DataSourceError::Other(format!("encode history: {}", e)))?;
        self.conn
            .execute(
                "INSERT INTO histories (console_id, entries) VALUES (?1, ?2) \
                 ON CONFLICT(console_id) DO UPDATE SET entries = excluded.entries",
                params![console_id, payload],
            )
            .map_err(db::map_err)?;
        Ok(())
    }
}

// ── Row mappers ─────────────────────────────────────────────────────────

/// Build a Connection from a row that selects every column except `password`.
/// Callers MUST fill `password` from `vault::get_password(&c.id)` before
/// returning the connection to the rest of the app.
fn row_to_connection_no_password(row: &rusqlite::Row<'_>) -> rusqlite::Result<DsConnection> {
    let status_str: String = row.get("status")?;
    let status = match status_str.as_str() {
        "online" => ConnectionStatus::Online,
        _ => ConnectionStatus::Offline,
    };
    Ok(DsConnection {
        id: row.get("id")?,
        name: row.get("name")?,
        host: row.get("host")?,
        port: row.get::<_, u16>("port")?,
        user: row.get("user")?,
        password: String::new(),
        color: row.get("color")?,
        status,
    })
}

/// One-time migration: move any plaintext password that survived from before
/// `add-credential-vault` into the OS vault and blank the db column. Idempotent
/// — after the first successful run every row's password column is "" so the
/// SELECT returns nothing on subsequent boots.
fn migrate_passwords_to_vault(
    conn: &rusqlite::Connection,
) -> Result<(), DataSourceError> {
    let mut stmt = conn
        .prepare("SELECT id, password FROM connections WHERE password != ''")
        .map_err(db::map_err)?;
    let rows: Vec<(String, String)> = stmt
        .query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })
        .map_err(db::map_err)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(db::map_err)?;
    if rows.is_empty() {
        return Ok(());
    }

    // Write every row to the vault first; if any one fails, leave the db
    // untouched so the next startup retries cleanly.
    for (id, password) in &rows {
        vault::set_password(id, password)?;
    }

    // Once the vault is consistent, atomically blank the db columns.
    let tx = conn.unchecked_transaction().map_err(db::map_err)?;
    for (id, _) in &rows {
        tx.execute(
            "UPDATE connections SET password = '' WHERE id = ?1",
            params![id],
        )
        .map_err(db::map_err)?;
    }
    tx.commit().map_err(db::map_err)?;
    Ok(())
}

fn row_to_console(row: &rusqlite::Row<'_>) -> rusqlite::Result<DsConsole> {
    Ok(DsConsole {
        id: row.get("id")?,
        name: row.get("name")?,
        connection_id: row.get("connection_id")?,
        current_db: row.get("current_db")?,
        created_at: row.get::<_, i64>("created_at")? as u64,
    })
}

fn status_str(status: &ConnectionStatus) -> &'static str {
    match status {
        ConnectionStatus::Online => "online",
        ConnectionStatus::Offline => "offline",
    }
}
