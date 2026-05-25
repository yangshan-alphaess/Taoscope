// OS credential vault wrapper.
//
// Each connection's password lives in the platform keychain (macOS Keychain
// Services / Linux secret-service / Windows Credential Manager) under
// `service = "Taoscope"`, `account = <connection_id>`. The db's
// connections.password column is kept as a permanent "" placeholder; the live
// value flows through this module.
//
// All three operations map keyring's `NoEntry` to the empty-password case so
// the caller never has to special-case "user has no saved password".

use crate::datasource::error::DataSourceError;

pub const SERVICE: &str = "Taoscope";

fn entry(conn_id: &str) -> Result<keyring::Entry, DataSourceError> {
    keyring::Entry::new(SERVICE, conn_id).map_err(map_err)
}

fn map_err(e: keyring::Error) -> DataSourceError {
    DataSourceError::Other(format!("vault: {}", e))
}

/// Set the password for a connection. An empty string deletes the entry so
/// `get_password` returns `""` on the next read.
pub fn set_password(conn_id: &str, password: &str) -> Result<(), DataSourceError> {
    let entry = entry(conn_id)?;
    if password.is_empty() {
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(map_err(e)),
        }
    } else {
        entry.set_password(password).map_err(map_err)
    }
}

/// Return the stored password, or `""` if no entry exists for this connection.
pub fn get_password(conn_id: &str) -> Result<String, DataSourceError> {
    let entry = entry(conn_id)?;
    match entry.get_password() {
        Ok(s) => Ok(s),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(e) => Err(map_err(e)),
    }
}

/// Delete the entry; missing entries are treated as success (idempotent).
pub fn delete_password(conn_id: &str) -> Result<(), DataSourceError> {
    let entry = entry(conn_id)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(map_err(e)),
    }
}
