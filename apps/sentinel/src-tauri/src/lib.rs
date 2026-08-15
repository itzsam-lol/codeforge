mod commands;
mod models;
mod services;

use commands::clipboard::ClipboardGuardState;
use services::heartbeat::HeartbeatState;
use services::watchdog::{self, WatchdogState};
use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let watchdog_state = Arc::new(WatchdogState::new());
    let watchdog_state_for_setup = watchdog_state.clone();
    let clipboard_state = Arc::new(ClipboardGuardState::new());
    let clipboard_state_for_setup = clipboard_state.clone();
    let heartbeat_state = Arc::new(HeartbeatState::new());

    tauri::Builder::default()
        .manage(watchdog_state)
        .manage(clipboard_state)
        .manage(heartbeat_state)
        .setup(move |app| {
            watchdog::spawn(app.handle().clone(), watchdog_state_for_setup);
            commands::clipboard::spawn(app.handle().clone(), clipboard_state_for_setup);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system_info::get_system_info,
            commands::process_monitor::get_running_processes,
            commands::process_monitor::get_blacklist_violations,
            commands::process_monitor::kill_process,
            commands::process_monitor::set_auto_terminate_on_hard_violation,
            commands::vm_detector::detect_virtual_machine,
            commands::kiosk::install_hotkey_lock,
            commands::kiosk::uninstall_hotkey_lock,
            commands::kiosk::is_hotkey_lock_active,
            commands::kiosk::enter_kiosk_window,
            commands::kiosk::exit_kiosk_window,
            commands::kiosk::get_display_count,
            commands::screen_guard::enable_capture_protection,
            commands::screen_guard::disable_capture_protection,
            commands::clipboard::set_clipboard_lockdown,
            commands::clipboard::is_clipboard_lockdown_active,
            commands::clipboard::clear_clipboard_now,
            commands::network_watcher::get_active_connections,
            commands::network_watcher::flag_unexpected_connections,
            commands::integrity::get_system_fingerprint,
            commands::heartbeat::start_heartbeat,
            commands::heartbeat::stop_heartbeat,
        ])
        .run(tauri::generate_context!())
        .expect("error while running codeforge sentinel");
}
