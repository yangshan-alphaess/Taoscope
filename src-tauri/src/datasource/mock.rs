// First-run seed source.
//
// `seed_connections` is called by `db::seed_if_empty` when the `connections`
// table is empty on first launch. Returning an empty vec means a fresh
// install lands on a blank slate — users add their own connections via
// ConnectionFormDialog.

use crate::datasource::types::Connection;

pub fn seed_connections() -> Vec<Connection> {
    Vec::new()
}
