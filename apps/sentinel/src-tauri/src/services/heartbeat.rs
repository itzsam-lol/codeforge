use crate::commands::network_watcher::get_active_connections;
use crate::services::watchdog::WatchdogState;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use sysinfo::System;

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(15);

pub struct HeartbeatState {
    running: AtomicBool,
    /// How many of watchdog's Violation entries have already been sent in a
    /// previous heartbeat — each tick reports only the delta since last
    /// time. Reusing watchdog's own once-per-lapse log (instead of
    /// independently re-scanning and re-classifying processes here, which
    /// is what this used to do) means a violation that stays open for the
    /// whole test gets reported once, not once per 15s tick for the entire
    /// duration.
    reported_violation_count: AtomicUsize,
}

impl HeartbeatState {
    pub fn new() -> Self {
        Self {
            running: AtomicBool::new(false),
            reported_violation_count: AtomicUsize::new(0),
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
pub fn spawn(
    state: Arc<HeartbeatState>,
    watchdog: Arc<WatchdogState>,
    api_base_url: String,
    candidate_token: String,
) {
    state.running.store(true, Ordering::SeqCst);
    std::thread::spawn(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(10))
            .build();
        let Ok(client) = client else { return };
        let url = format!("{}/api/candidate/sentinel-heartbeat", api_base_url.trim_end_matches('/'));

        while state.running.load(Ordering::SeqCst) {
            let payload = build_payload(&watchdog, &state.reported_violation_count);
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

/// Only the violations logged since the last call — reused directly from
/// watchdog's own once-per-lapse log rather than re-scanning/re-classifying
/// processes independently, which is what this used to do (see the doc
/// comment on `HeartbeatState`).
fn delta_violations(watchdog: &WatchdogState, reported_count: &AtomicUsize) -> Vec<String> {
    let violations = watchdog.violations.lock().unwrap();
    let already_sent = reported_count.load(Ordering::Relaxed).min(violations.len());
    let delta: Vec<String> = violations[already_sent..].iter().map(|v| v.process_name.clone()).collect();
    reported_count.store(violations.len(), Ordering::Relaxed);
    delta
}

fn build_payload(watchdog: &WatchdogState, reported_count: &AtomicUsize) -> HeartbeatPayload {
    let mut sys = System::new_all();
    sys.refresh_all();
    let process_count = sys.processes().len();

    let blacklist_violations = delta_violations(watchdog, reported_count);

    // Retries once on the classic GetExtendedTcpTable size/fill race (the
    // connection count can change between the two calls on a busy machine)
    // rather than silently reporting 0 connections on a transient failure.
    let network_connections = get_active_connections()
        .or_else(|_| get_active_connections())
        .map(|c| c.len())
        .unwrap_or(0);
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::violation::{Severity, Violation, ViolationCategory};

    fn violation(name: &str) -> Violation {
        Violation {
            id: name.to_string(),
            category: ViolationCategory::ScreenSharing,
            process_name: name.to_string(),
            pid: 1,
            severity: Severity::Soft,
            detected_at_ms: 0,
            terminated: false,
        }
    }

    /// Regression test for the bug this fix addresses: a violation that
    /// stays logged (process keeps running) must be reported exactly once,
    /// not on every subsequent heartbeat tick.
    #[test]
    fn reports_only_new_violations_since_last_call() {
        let watchdog = WatchdogState::new();
        let reported = AtomicUsize::new(0);

        // Nothing logged yet.
        assert_eq!(delta_violations(&watchdog, &reported), Vec::<String>::new());

        watchdog.violations.lock().unwrap().push(violation("discord.exe"));
        assert_eq!(delta_violations(&watchdog, &reported), vec!["discord.exe".to_string()]);

        // Same violation still sitting in watchdog's log (process still
        // running) — must NOT be reported again on the next tick.
        assert_eq!(delta_violations(&watchdog, &reported), Vec::<String>::new());

        // A second, genuinely new violation arrives — only it is reported,
        // not discord.exe again.
        watchdog.violations.lock().unwrap().push(violation("teamviewer.exe"));
        assert_eq!(delta_violations(&watchdog, &reported), vec!["teamviewer.exe".to_string()]);
        assert_eq!(delta_violations(&watchdog, &reported), Vec::<String>::new());
    }
}
