// Store: SQLite-backed persistence layer for application metadata.
//
// Holds a single `rusqlite::Connection` and exposes 15 domain methods that the
// Tauri commands in commands.rs delegate to. All connections / consoles /
// scratches / results / histories live in `<app_data_dir>/taoscope.db` and
// survive process restarts.
//
// Connection passwords are stored directly in the `connections.password`
// column as text. Empty password in update_connection means "keep current"
// so the edit dialog can leave the password field blank without losing the
// stored value.

use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};

use crate::datasource::db;
use crate::datasource::error::DataSourceError;
use crate::datasource::types::{
    AuthMode, Connection as DsConnection, ConnectionInput, ConnectionStatus, Console as DsConsole,
    CreateConsoleInput, HistoryEntry, Protocol, QueryResult,
};

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
        Ok(Self { conn })
    }

    // ── Connections ─────────────────────────────────────────────────────

    pub fn list_connections(&self) -> Result<Vec<DsConnection>, DataSourceError> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, name, host, port, user, password, color, status, auth_mode, token, \
                 protocol, allow_invalid_certs \
                 FROM connections ORDER BY rowid",
            )
            .map_err(db::map_err)?;
        let rows = stmt
            .query_map([], row_to_connection)
            .map_err(db::map_err)?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(db::map_err)?);
        }
        Ok(out)
    }

    pub fn get_connection(&self, id: &str) -> Result<DsConnection, DataSourceError> {
        self.conn
            .query_row(
                "SELECT id, name, host, port, user, password, color, status, auth_mode, token, \
                 protocol, allow_invalid_certs \
                 FROM connections WHERE id = ?1",
                params![id],
                row_to_connection,
            )
            .optional()
            .map_err(db::map_err)?
            .ok_or_else(|| DataSourceError::NotFound(format!("Connection not found: {}", id)))
    }

    pub fn create_connection(
        &mut self,
        input: ConnectionInput,
    ) -> Result<DsConnection, DataSourceError> {
        let name = input.name.trim().to_string();
        let id = nanoid::nanoid!();

        if matches!(input.auth_mode, AuthMode::Token)
            && input.token.as_deref().unwrap_or("").is_empty()
        {
            return Err(DataSourceError::Other(
                "Token is required when authMode='token'".into(),
            ));
        }

        self.conn
            .execute(
                "INSERT INTO connections \
                 (id, name, host, port, user, password, color, status, auth_mode, token, \
                  protocol, allow_invalid_certs) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    id,
                    name,
                    input.host,
                    input.port,
                    input.user,
                    input.password,
                    input.color,
                    status_str(&ConnectionStatus::Online),
                    auth_mode_str(input.auth_mode),
                    input.token,
                    input.protocol.as_str(),
                    input.allow_invalid_certs as i64,
                ],
            )
            .map_err(|e| match db::map_err(e) {
                DataSourceError::AlreadyExists(_) => DataSourceError::AlreadyExists(format!(
                    "Connection name '{}' already exists",
                    name
                )),
                other => other,
            })?;

        Ok(DsConnection {
            id,
            name,
            host: input.host,
            port: input.port,
            user: input.user,
            password: input.password,
            color: input.color,
            status: ConnectionStatus::Online,
            auth_mode: input.auth_mode,
            token: input.token,
            protocol: input.protocol,
            allow_invalid_certs: input.allow_invalid_certs,
        })
    }

    pub fn update_connection(
        &mut self,
        id: &str,
        input: ConnectionInput,
    ) -> Result<(), DataSourceError> {
        // Verify connection exists first so we can return a clean NotFound.
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

        // Empty password / token in update means "keep current" — the edit
        // dialog never echoes secrets back, so absence of input must not
        // overwrite the stored value. Build the SET clause dynamically so
        // we only touch the secret column the user actually typed into.
        let mut sets: Vec<&str> = vec![
            "name = ?",
            "host = ?",
            "port = ?",
            "user = ?",
            "color = ?",
            "auth_mode = ?",
            "protocol = ?",
            "allow_invalid_certs = ?",
        ];
        let mut values: Vec<Box<dyn rusqlite::ToSql>> = vec![
            Box::new(name.clone()),
            Box::new(input.host.clone()),
            Box::new(input.port),
            Box::new(input.user.clone()),
            Box::new(input.color.clone()),
            Box::new(auth_mode_str(input.auth_mode)),
            Box::new(input.protocol.as_str()),
            Box::new(input.allow_invalid_certs as i64),
        ];

        let password_provided = !input.password.is_empty();
        if password_provided {
            sets.push("password = ?");
            values.push(Box::new(input.password.clone()));
        }

        let token_provided = input
            .token
            .as_deref()
            .map(|t| !t.is_empty())
            .unwrap_or(false);
        if token_provided {
            sets.push("token = ?");
            values.push(Box::new(input.token.clone()));
        }

        // When switching INTO token mode, the user must have provided a
        // token at some point (either now or already stored). Verify.
        if matches!(input.auth_mode, AuthMode::Token) && !token_provided {
            let existing_token: Option<String> = self
                .conn
                .query_row(
                    "SELECT token FROM connections WHERE id = ?1",
                    params![id],
                    |r| r.get::<_, Option<String>>(0),
                )
                .optional()
                .map_err(db::map_err)?
                .flatten();
            if existing_token.as_deref().unwrap_or("").is_empty() {
                return Err(DataSourceError::Other(
                    "Token is required when authMode='token'".into(),
                ));
            }
        }

        let sql = format!(
            "UPDATE connections SET {} WHERE id = ?",
            sets.join(", ")
        );
        let id_box: Box<dyn rusqlite::ToSql> = Box::new(id.to_string());
        values.push(id_box);
        let params_refs: Vec<&dyn rusqlite::ToSql> =
            values.iter().map(|b| b.as_ref()).collect();

        self.conn
            .execute(&sql, params_refs.as_slice())
            .map_err(|e| match db::map_err(e) {
                DataSourceError::AlreadyExists(_) => DataSourceError::AlreadyExists(format!(
                    "Connection name '{}' already exists",
                    name
                )),
                other => other,
            })?;

        Ok(())
    }

    pub fn delete_connection(&mut self, id: &str) -> Result<(), DataSourceError> {
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
            .prepare("SELECT name FROM consoles WHERE connection_id = ?1")
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

fn row_to_connection(row: &rusqlite::Row<'_>) -> rusqlite::Result<DsConnection> {
    let status_str: String = row.get("status")?;
    let status = match status_str.as_str() {
        "online" => ConnectionStatus::Online,
        _ => ConnectionStatus::Offline,
    };
    let auth_mode_str: String = row.get("auth_mode")?;
    let auth_mode = match auth_mode_str.as_str() {
        "token" => AuthMode::Token,
        _ => AuthMode::Basic,
    };
    let protocol_str: String = row.get("protocol")?;
    let protocol = match protocol_str.as_str() {
        "https" => Protocol::Https,
        _ => Protocol::Http,
    };
    let allow_invalid_certs: i64 = row.get("allow_invalid_certs")?;
    Ok(DsConnection {
        id: row.get("id")?,
        name: row.get("name")?,
        host: row.get("host")?,
        port: row.get::<_, u16>("port")?,
        user: row.get("user")?,
        password: row.get("password")?,
        color: row.get("color")?,
        status,
        auth_mode,
        token: row.get("token")?,
        protocol,
        allow_invalid_certs: allow_invalid_certs != 0,
    })
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

fn auth_mode_str(mode: AuthMode) -> &'static str {
    match mode {
        AuthMode::Basic => "basic",
        AuthMode::Token => "token",
    }
}
