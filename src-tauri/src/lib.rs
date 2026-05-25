pub mod commands;
pub mod datasource;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(std::sync::Mutex::new(
            crate::datasource::state::MockState::with_seed(),
        ))
        .invoke_handler(tauri::generate_handler![
            commands::list_connections,
            commands::test_connection,
            commands::create_connection,
            commands::update_connection,
            commands::delete_connection,
            commands::test_connection_config,
            commands::list_databases,
            commands::list_stables,
            commands::list_tables,
            commands::describe_table,
            commands::run_sql,
            commands::load_scratch,
            commands::save_scratch,
            commands::list_consoles,
            commands::create_console,
            commands::rename_console,
            commands::update_console_db,
            commands::delete_console,
            commands::load_result,
            commands::save_result,
            commands::load_history,
            commands::save_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
