mod commands;
mod models;
mod services;

use commands::clipboard::ClipboardGuardState;
use services::heartbeat::HeartbeatState;
use services::watchdog::{self, WatchdogState};
use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let watchdog_state = Arc::new(WatchdogState::new());
    let watchdog_state_for_setup = watchdog_state.clone();
    let watchdog_state_for_link = watchdog_state.clone();
    let clipboard_state = Arc::new(ClipboardGuardState::new());
    let clipboard_state_for_setup = clipboard_state.clone();
    let heartbeat_state = Arc::new(HeartbeatState::new());
    let heartbeat_state_for_link = heartbeat_state.clone();

    tauri::Builder::default()
        // Must be the first plugin registered (Tauri's own requirement).
        // With the deep-link feature enabled, its default callback already
        // forwards a second launch's URL argument into the deep-link
        // plugin's handle_cli_arguments below — so a candidate clicking the
        // "Open Sentinel" link while it's already running reuses this
        // window instead of spawning a duplicate.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .manage(watchdog_state)
        .manage(clipboard_state)
        .manage(heartbeat_state)
        .setup(move |app| {
            watchdog::spawn(app.handle().clone(), watchdog_state_for_setup);
            commands::clipboard::spawn(app.handle().clone(), clipboard_state_for_setup);

            // Best-effort self-registration as the codeforge-sentinel://
            // protocol handler. Production installs get this for free from
            // the NSIS bundler (tauri.conf.json's plugins.deep-link config),
            // but that only runs once at install time — doing it here too
            // means a dev build (`npm run dev:sentinel`) registers itself on
            // every launch as well, so the link works without a full
            // installer during development. Per-user registry write (no
            // admin rights needed) — failure here is non-fatal.
            #[cfg(windows)]
            {
                let _ = app.deep_link().register("codeforge-sentinel");
            }

            let app_handle = app.handle().clone();
            let heartbeat_for_open = heartbeat_state_for_link.clone();
            let watchdog_for_open = watchdog_state_for_link.clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    services::session_link::handle(&app_handle, &heartbeat_for_open, &watchdog_for_open, url);
                }
            });

            // Covers the case where Sentinel itself was launched fresh by
            // the link (not already running) — handle_cli_arguments already
            // ran during plugin init and populated get_current() before
            // this on_open_url listener above existed to catch the event.
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for url in urls {
                    services::session_link::handle(app.handle(), &heartbeat_state_for_link, &watchdog_state_for_link, url);
                }
            }

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
