// In-flight query registry: maps front-end-generated query IDs to a
// `CancellationToken` so an out-of-band `cancel_query` IPC can interrupt a
// running `run_sql`. The registry lives behind `tauri::State` and is
// accessed from synchronous Tauri command bodies — we keep it under
// `std::sync::Mutex` and never hold the lock across an `.await`.

use std::collections::HashMap;
use std::sync::Mutex;

use tokio_util::sync::CancellationToken;

pub struct InFlightRegistry {
    inner: Mutex<HashMap<String, CancellationToken>>,
}

impl InFlightRegistry {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
        }
    }

    /// Register a query under `query_id` and return a fresh clone of its
    /// cancellation token. Subsequent `cancel(query_id)` fires the token.
    pub fn register(&self, query_id: &str) -> CancellationToken {
        let token = CancellationToken::new();
        self.inner
            .lock()
            .unwrap()
            .insert(query_id.to_string(), token.clone());
        token
    }

    /// Drop the registry entry without firing the token. Called when the
    /// query completes (success or error) so the map does not leak.
    pub fn unregister(&self, query_id: &str) {
        self.inner.lock().unwrap().remove(query_id);
    }

    /// Atomically remove + cancel the token. Returns true if an entry was
    /// found (the caller observed an in-flight query).
    pub fn cancel(&self, query_id: &str) -> bool {
        if let Some(token) = self.inner.lock().unwrap().remove(query_id) {
            token.cancel();
            true
        } else {
            false
        }
    }
}
