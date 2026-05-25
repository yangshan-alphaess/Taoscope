use std::collections::HashMap;

use crate::datasource::mock::seed_connections;
use crate::datasource::types::{Connection, Console, HistoryEntry, QueryResult};

pub struct MockState {
    pub connections: Vec<Connection>,
    pub consoles: Vec<Console>,
    pub scratches: HashMap<String, String>,
    pub results: HashMap<String, QueryResult>,
    pub histories: HashMap<String, Vec<HistoryEntry>>,
}

impl MockState {
    pub fn with_seed() -> Self {
        Self {
            connections: seed_connections(),
            consoles: Vec::new(),
            scratches: HashMap::new(),
            results: HashMap::new(),
            histories: HashMap::new(),
        }
    }
}
