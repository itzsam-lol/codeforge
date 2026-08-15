use crate::models::process_info::ProcessInfo;
use crate::models::violation::{Violation, ViolationCategory};
use crate::services::watchdog::WatchdogState;
use std::sync::Arc;
use sysinfo::{Pid, System};

/// Category + whether a hit is blocked on sight (vs. given the 30s soft-block
/// grace period) + substring patterns matched case-insensitively against
/// both the process name and its executable path (some tools are only
/// reliably identified by one or the other).
struct BlacklistEntry {
    category: ViolationCategory,
    critical: bool,
    patterns: &'static [&'static str],
}

const BLACKLIST: &[BlacklistEntry] = &[
    BlacklistEntry {
        category: ViolationCategory::RemoteDesktop,
        critical: true,
        patterns: &[
            "teamviewer",
            "anydesk",
            "rustdesk",
            "chrome_remote_desktop",
            "chromoting",
            "mstsc",
            "vncviewer",
            "tightvnc",
            "ultravnc",
            "splashtop",
            "parsec",
            "nomachine",
        ],
    },
    BlacklistEntry {
        category: ViolationCategory::VirtualMachine,
        critical: true,
        patterns: &[
            "vmware",
            "vboxservice",
            "vboxtray",
            "vboxclient",
            "virtualbox",
            "qemu",
            "vmusrvc",
            "vmtoolsd",
            "vmwaretray",
        ],
    },
    BlacklistEntry {
        category: ViolationCategory::ScreenSharing,
        critical: false,
        patterns: &["zoom", "discord", "obs", "obs64", "streamlabs", "xsplit"],
    },
    BlacklistEntry {
        category: ViolationCategory::AiAssistant,
        critical: false,
        patterns: &["chatgpt", "copilot", "claude"],
    },
    BlacklistEntry {
        category: ViolationCategory::ScreenCapture,
        critical: false,
        patterns: &[
            "snagit",
            "greenshot",
            "lightshot",
            "sharex",
            "screenpresso",
            "nimbus",
        ],
    },
    BlacklistEntry {
        category: ViolationCategory::Automation,
        critical: false,
        patterns: &["autohotkey", "autoit", "tinytask", "jitbit"],
    },
    BlacklistEntry {
        category: ViolationCategory::Communication,
        critical: false,
        patterns: &["whatsapp", "telegram", "signal", "slack", "teams"],
    },
];

/// Returns the first matching category + criticality for a process, or
/// `None` if it isn't on the blacklist.
pub fn classify(name: &str, exe_path: &str) -> Option<(ViolationCategory, bool)> {
    let name_l = name.to_lowercase();
    let path_l = exe_path.to_lowercase();
    for entry in BLACKLIST {
        if entry
            .patterns
            .iter()
            .copied()
            .any(|pat| name_l.contains(pat) || path_l.contains(pat))
        {
            return Some((entry.category, entry.critical));
        }
    }
    None
}

pub fn scan_processes(sys: &System) -> Vec<ProcessInfo> {
    sys.processes()
        .values()
        .map(|p| ProcessInfo {
            pid: p.pid().as_u32(),
            name: p.name().to_string_lossy().to_string(),
            exe_path: p.exe().map(|e| e.to_string_lossy().to_string()),
            parent_pid: p.parent().map(|pp| pp.as_u32()),
            cpu_usage: p.cpu_usage(),
            memory_kb: p.memory() / 1024,
            start_time: p.start_time(),
        })
        .collect()
}

/// One-shot full process list — used by the frontend's "system check" view.
/// The watchdog service (services/watchdog.rs) is the one continuously
/// scanning for blacklist violations in the background; this command is a
/// point-in-time snapshot, not a substitute for that loop.
#[tauri::command]
pub fn get_running_processes() -> Vec<ProcessInfo> {
    let mut sys = System::new_all();
    sys.refresh_all();
    scan_processes(&sys)
}

#[tauri::command]
pub fn get_blacklist_violations(state: tauri::State<'_, Arc<WatchdogState>>) -> Vec<Violation> {
    state.violations.lock().unwrap().clone()
}

#[tauri::command]
pub fn kill_process(pid: u32) -> Result<(), String> {
    let mut sys = System::new_all();
    sys.refresh_all();
    match sys.process(Pid::from_u32(pid)) {
        Some(process) => {
            if process.kill() {
                Ok(())
            } else {
                Err("Failed to terminate process (it may require elevated permissions)".into())
            }
        }
        None => Err(format!("No process with pid {pid}")),
    }
}

#[tauri::command]
pub fn set_auto_terminate_on_hard_violation(
    enabled: bool,
    state: tauri::State<'_, Arc<WatchdogState>>,
) {
    state.config.set_auto_terminate_on_hard_violation(enabled);
}
