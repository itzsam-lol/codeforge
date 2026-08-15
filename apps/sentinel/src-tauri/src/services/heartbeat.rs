use crate::commands::network_watcher::get_active_connections;
use crate::commands::process_monitor;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use sysinfo::System;

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(15);

pub struct HeartbeatState {
    running: AtomicBool,
}

impl HeartbeatState {
    pub fn new() -> Self {
        Self {
            running: AtomicBool::new(false),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HeartbeatPayload {
    process_count: usize,
    blacklist_violations: Vec<String>,
    network_connections: usize,
    webcam_active: bool,
    kiosk_active: bool,
    hardware_hash: Option<String>,
}

/// POSTs a heartbeat to the CodeForge API every 15s while `running` stays
/// true — matches candidate.routes.ts's POST /candidate/sentinel-heartbeat
/// on the backend, and its 60s-stale sweep (services/sentinel.ts). `token`
/// is the candidate's x-candidate-token, the same credential the browser
/// candidate flow uses; there's no separate Sentinel-specific auth scheme.
///
/// NOT wired to any UI or the deep-link URL scheme
/// (codeforge-sentinel://start?token=...) the spec describes for the
/// candidate flow — that's OS-level protocol-handler registration, a
/// separate chunk of platform-specific work not attempted in this pass.
/// This service only proves the client-to-API half of the pipe works,
/// given a token from wherever the eventual candidate flow gets one.
pub fn spawn(state: Arc<HeartbeatState>, api_base_url: String, candidate_token: String) {
    state.running.store(true, Ordering::SeqCst);
    std::thread::spawn(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(10))
            .build();
        let Ok(client) = client else { return };
        let url = format!("{}/api/candidate/sentinel-heartbeat", api_base_url.trim_end_matches('/'));

        while state.running.load(Ordering::SeqCst) {
            let payload = build_payload();
            let _ = client
                .post(&url)
                .header("x-candidate-token", &candidate_token)
                .json(&payload)
                .send();
            std::thread::sleep(HEARTBEAT_INTERVAL);
        }
    });
}

pub fn stop(state: &HeartbeatState) {
    state.running.store(false, Ordering::SeqCst);
}

fn build_payload() -> HeartbeatPayload {
    let mut sys = System::new_all();
    sys.refresh_all();
    let process_count = sys.processes().len();

    let blacklist_violations: Vec<String> = process_monitor::scan_processes(&sys)
        .into_iter()
        .filter_map(|p| {
            process_monitor::classify(&p.name, p.exe_path.as_deref().unwrap_or(""))
                .map(|_| p.name)
        })
        .collect();

    let network_connections = get_active_connections().map(|c| c.len()).unwrap_or(0);
    let hardware_hash = Some(crate::commands::integrity::get_system_fingerprint().hash);

    HeartbeatPayload {
        process_count,
        blacklist_violations,
        network_connections,
        // Neither is tracked as real state yet: Phase 8 (webcam) isn't
        // built, and kiosk.rs's enter/exit_kiosk_window are stateless
        // one-shot actions with nothing recording whether fullscreen is
        // currently active. Both always report false until that exists.
        webcam_active: false,
        kiosk_active: false,
        hardware_hash,
    }
}
