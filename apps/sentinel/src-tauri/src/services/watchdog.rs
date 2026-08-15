use crate::commands::process_monitor::classify;
use crate::models::config::SentinelConfig;
use crate::models::violation::{Severity, Violation, ViolationCategory};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use sysinfo::System;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

const SCAN_INTERVAL: Duration = Duration::from_secs(3);
const SOFT_BLOCK_GRACE: Duration = Duration::from_secs(30);
const VIOLATION_EVENT: &str = "sentinel://violation";

pub struct WatchdogState {
    pub violations: Mutex<Vec<Violation>>,
    pub config: SentinelConfig,
}

impl WatchdogState {
    pub fn new() -> Self {
        Self {
            violations: Mutex::new(Vec::new()),
            config: SentinelConfig::new(),
        }
    }
}

struct Tracked {
    first_seen: Instant,
    escalated: bool,
}

/// Continuous background scan loop (Phase 2's "Process Scanner" + "Detection
/// Actions" + "Zombie/Orphan Process Detection"), polling every
/// `SCAN_INTERVAL`. Deliberately NOT implementing the spec's further
/// enhancement of catching processes that launch-and-exit between polls
/// (Windows WMI `Win32_ProcessStartTrace`, macOS Endpoint Security, Linux
/// netlink/inotify) — that's real-time, platform-specific, and much
/// higher-risk code to ship unverified. A 3s poll interval is the interim
/// mitigation; revisit if this gap matters in practice.
pub fn spawn(app: AppHandle, state: Arc<WatchdogState>) {
    thread::spawn(move || {
        let mut sys = System::new_all();
        // pid -> tracking state, only for non-critical (soft-blocked) hits;
        // critical hits are handled (and terminated, if configured) the
        // instant they're seen, so they don't need grace-period tracking.
        let mut tracked: HashMap<u32, Tracked> = HashMap::new();
        let mut orphan_logged: HashSet<u32> = HashSet::new();

        loop {
            sys.refresh_all();
            let running_pids: HashSet<u32> = sys.processes().keys().map(|p| p.as_u32()).collect();

            for (pid, process) in sys.processes() {
                let pid_u32 = pid.as_u32();
                let name = process.name().to_string_lossy().to_string();
                let exe = process
                    .exe()
                    .map(|e| e.to_string_lossy().to_string())
                    .unwrap_or_default();

                let Some((category, critical)) = classify(&name, &exe) else {
                    continue;
                };

                if critical {
                    if let std::collections::hash_map::Entry::Vacant(entry) = tracked.entry(pid_u32) {
                        let terminated = maybe_terminate(&state, process);
                        record_and_emit(
                            &app,
                            &state,
                            build_violation(category, &name, pid_u32, Severity::Hard, terminated),
                        );
                        entry.insert(Tracked {
                            first_seen: Instant::now(),
                            escalated: true,
                        });
                    }
                    continue;
                }

                match tracked.get_mut(&pid_u32) {
                    None => {
                        record_and_emit(
                            &app,
                            &state,
                            build_violation(category, &name, pid_u32, Severity::Soft, false),
                        );
                        tracked.insert(
                            pid_u32,
                            Tracked {
                                first_seen: Instant::now(),
                                escalated: false,
                            },
                        );
                    }
                    Some(entry)
                        if !entry.escalated && entry.first_seen.elapsed() >= SOFT_BLOCK_GRACE =>
                    {
                        entry.escalated = true;
                        let terminated = maybe_terminate(&state, process);
                        record_and_emit(
                            &app,
                            &state,
                            build_violation(category, &name, pid_u32, Severity::Hard, terminated),
                        );
                    }
                    _ => {}
                }
            }

            // A running process whose parent no longer exists — logged once
            // per pid, informational only (no escalation/termination; this
            // isn't a blacklist hit, just something worth a recruiter's eye).
            for (pid, process) in sys.processes() {
                let pid_u32 = pid.as_u32();
                if orphan_logged.contains(&pid_u32) {
                    continue;
                }
                if let Some(parent) = process.parent() {
                    if !running_pids.contains(&parent.as_u32()) {
                        orphan_logged.insert(pid_u32);
                        let name = process.name().to_string_lossy().to_string();
                        record_and_emit(
                            &app,
                            &state,
                            build_violation(ViolationCategory::Orphaned, &name, pid_u32, Severity::Soft, false),
                        );
                    }
                }
            }

            // Drop tracking for pids that have exited, so relaunching the
            // same blacklisted app under a new pid gets its own fresh
            // soft-block grace period instead of being silently ignored.
            tracked.retain(|pid, _| running_pids.contains(pid));
            orphan_logged.retain(|pid| running_pids.contains(pid));

            thread::sleep(SCAN_INTERVAL);
        }
    });
}

fn maybe_terminate(state: &WatchdogState, process: &sysinfo::Process) -> bool {
    if state.config.auto_terminate_on_hard_violation() {
        process.kill()
    } else {
        false
    }
}

fn build_violation(
    category: ViolationCategory,
    name: &str,
    pid: u32,
    severity: Severity,
    terminated: bool,
) -> Violation {
    Violation {
        id: Uuid::new_v4().to_string(),
        category,
        process_name: name.to_string(),
        pid,
        severity,
        detected_at_ms: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
        terminated,
    }
}

fn record_and_emit(app: &AppHandle, state: &WatchdogState, violation: Violation) {
    state.violations.lock().unwrap().push(violation.clone());
    let _ = app.emit(VIOLATION_EVENT, &violation);
}
