mod commands;
mod models;
mod services;

use services::watchdog::{self, WatchdogState};
use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let watchdog_state = Arc::new(WatchdogState::new());
    let watchdog_state_for_setup = watchdog_state.clone();

    tauri::Builder::default()
        .manage(watchdog_state)
        .setup(move |app| {
            watchdog::spawn(app.handle().clone(), watchdog_state_for_setup);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system_info::get_system_info,
            commands::process_monitor::get_running_processes,
            commands::process_monitor::get_blacklist_violations,
            commands::process_monitor::kill_process,
            commands::process_monitor::set_auto_terminate_on_hard_violation,
        ])
        .run(tauri::generate_context!())
        .expect("error while running codeforge sentinel");
}
