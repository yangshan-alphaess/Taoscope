use std::path::PathBuf;

use tauri::Manager;

pub mod commands;
pub mod datasource;

fn resolve_db_path(
    app: &tauri::AppHandle,
) -> Result<PathBuf, Box<dyn std::error::Error>> {
    if let Ok(override_path) = std::env::var("TAOSCOPE_DB_PATH") {
        return Ok(PathBuf::from(override_path));
    }
    let dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("taoscope.db"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Updater + process plugins enable in-app upgrades. The updater pulls
        // `latest.json` from the endpoint configured in tauri.conf.json,
        // verifies its ed25519 signature against the bundled pubkey, and the
        // process plugin's `relaunch()` swaps the running binary in place.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        // Reposition the macOS traffic lights after the window is shown and on
        // every resize. Setting `trafficLightPosition` statically in the config
        // does not stick — macOS re-lays-out the buttons after display — so we
        // rely on decorum's runtime positioner instead.
        .plugin(tauri_plugin_decorum::init())
        .setup(|app| {
            let db_path = resolve_db_path(app.handle())?;
            let store = crate::datasource::state::Store::open(&db_path)
                .expect("failed to open SQLite database");
            app.manage(std::sync::Mutex::new(store));
            app.manage(crate::datasource::inflight::InFlightRegistry::new());

            // Vertically center the traffic lights in the 36px title bar. y≈16
            // lands their center on the bar's midline; x is the left inset.
            #[cfg(target_os = "macos")]
            {
                use tauri_plugin_decorum::WebviewWindowExt;
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.set_traffic_lights_inset(12.0, 16.0);
                }
            }

            Ok(())
        })
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
            commands::cancel_query,
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
