use crate::services::heartbeat::{self, HeartbeatState};
use std::sync::Arc;

#[tauri::command]
pub fn start_heartbeat(
    api_base_url: String,
    candidate_token: String,
    state: tauri::State<'_, Arc<HeartbeatState>>,
) {
    heartbeat::spawn(state.inner().clone(), api_base_url, candidate_token);
}

#[tauri::command]
pub fn stop_heartbeat(state: tauri::State<'_, Arc<HeartbeatState>>) {
    heartbeat::stop(&state);
}
