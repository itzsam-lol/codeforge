use serde::Serialize;
use sysinfo::System;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    os_name: String,
    os_version: String,
    hostname: String,
}

/// Phase 1 scaffold command: proves the Rust <-> WebView IPC round-trip
/// works before any real proctoring logic is built. Later phases replace
/// these ad hoc static sysinfo calls with the shared watchdog service that
/// owns one continuously-refreshed `System` instance (see services/watchdog.rs
/// in the implementation plan) rather than every command querying its own.
#[tauri::command]
pub fn get_system_info() -> SystemInfo {
    SystemInfo {
        os_name: System::name().unwrap_or_else(|| "unknown".into()),
        os_version: System::os_version().unwrap_or_else(|| "unknown".into()),
        hostname: System::host_name().unwrap_or_else(|| "unknown".into()),
    }
}
