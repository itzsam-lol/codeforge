use crate::services::heartbeat::{self, HeartbeatState};
use crate::services::watchdog::WatchdogState;
use std::sync::Arc;

#[tauri::command]
pub fn start_heartbeat(
    api_base_url: String,
    candidate_token: String,
    heartbeat_state: tauri::State<'_, Arc<HeartbeatState>>,
    watchdog_state: tauri::State<'_, Arc<WatchdogState>>,
) {
    heartbeat::spawn(
        heartbeat_state.inner().clone(),
        watchdog_state.inner().clone(),
        api_base_url,
        candidate_token,
    );
}

#[tauri::command]
pub fn stop_heartbeat(state: tauri::State<'_, Arc<HeartbeatState>>) {
    heartbeat::stop(&state);
}
