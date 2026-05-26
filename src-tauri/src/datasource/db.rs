// Database bootstrap: open + migrate + seed.
//
// `Store::open` calls into these functions on startup; after this file runs,
// the SQLite connection is ready for the 15 domain methods in state.rs.

use rusqlite::{params, Connection, ErrorCode};

use crate::datasource::error::DataSourceError;

const SCHEMA_V1: &str = r#"
CREATE TABLE IF NOT EXISTS connections (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    host        TEXT NOT NULL,
    port        INTEGER NOT NULL,
    user        TEXT NOT NULL,
    password    TEXT NOT NULL,
    color       TEXT,
    status      TEXT NOT NULL CHECK (status IN ('online','offline'))
);

CREATE TABLE IF NOT EXISTS consoles (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    current_db    TEXT,
    created_at    INTEGER NOT NULL,
    UNIQUE (connection_id, name)
);
CREATE INDEX IF NOT EXISTS idx_consoles_conn ON consoles(connection_id);

CREATE TABLE IF NOT EXISTS scratches (
    console_id TEXT PRIMARY KEY,
    content    TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS results (
    console_id TEXT PRIMARY KEY,
    payload    BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS histories (
    console_id TEXT PRIMARY KEY,
    entries    BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO meta(key, value) VALUES ('schema_version', '1');
"#;

const SCHEMA_V2_MIGRATION: &str = r#"
ALTER TABLE connections ADD COLUMN auth_mode TEXT NOT NULL DEFAULT 'basic' CHECK (auth_mode IN ('basic','token'));
ALTER TABLE connections ADD COLUMN token TEXT;
"#;

pub fn migrate(conn: &Connection) -> Result<(), DataSourceError> {
    conn.execute_batch(SCHEMA_V1).map_err(map_err)?;

    let current: String = conn
        .query_row(
            "SELECT value FROM meta WHERE key = 'schema_version'",
            [],
            |r| r.get(0),
        )
        .map_err(map_err)?;

    let mut version: u32 = current.parse().unwrap_or(1);

    if version < 2 {
        conn.execute_batch(SCHEMA_V2_MIGRATION).map_err(map_err)?;
        version = 2;
    }

    conn.execute(
        "UPDATE meta SET value = ?1 WHERE key = 'schema_version'",
        rusqlite::params![version.to_string()],
    )
    .map_err(map_err)?;

    Ok(())
}

pub fn seed_if_empty(conn: &Connection) -> Result<(), DataSourceError> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM connections", [], |r| r.get(0))
        .map_err(map_err)?;
    if count > 0 {
        return Ok(());
    }

    let seeded = crate::datasource::mock::seed_connections();
    let tx = conn.unchecked_transaction().map_err(map_err)?;
    for c in seeded {
        let status = match c.status {
            crate::datasource::types::ConnectionStatus::Online => "online",
            crate::datasource::types::ConnectionStatus::Offline => "offline",
        };
        tx.execute(
            "INSERT INTO connections (id, name, host, port, user, password, color, status) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![c.id, c.name, c.host, c.port, c.user, c.password, c.color, status],
        )
        .map_err(map_err)?;
    }
    tx.commit().map_err(map_err)?;
    Ok(())
}

pub fn map_err(e: rusqlite::Error) -> DataSourceError {
    match &e {
        rusqlite::Error::SqliteFailure(err, msg) => match err.code {
            ErrorCode::ConstraintViolation => DataSourceError::AlreadyExists(
                msg.clone().unwrap_or_else(|| e.to_string()),
            ),
            _ => DataSourceError::Other(e.to_string()),
        },
        rusqlite::Error::QueryReturnedNoRows => {
            DataSourceError::NotFound("Row not found".into())
        }
        _ => DataSourceError::Other(e.to_string()),
    }
}
