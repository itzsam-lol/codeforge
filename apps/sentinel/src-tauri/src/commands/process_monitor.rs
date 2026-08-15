use crate::models::process_info::ProcessInfo;
use crate::models::violation::{Violation, ViolationCategory};
use crate::services::watchdog::WatchdogState;
use std::sync::Arc;
use sysinfo::{Pid, System};

/// How a pattern is matched against the process filename (never the full
/// path — see the note on `classify` below for why path-matching was
/// removed entirely, not just narrowed).
#[derive(Clone, Copy)]
enum MatchMode {
    /// Filename with its extension stripped must equal the pattern exactly.
    /// Used for short/generic strings that are real English words or common
    /// word-fragments — substring-matching these produces real false
    /// positives: "teamspeak".contains("teams"), "jobs".contains("obs"),
    /// "AutoItemManager".contains("autoit"), all confirmed by hand before
    /// this fix. Exact-stem matching trades a little recall (won't catch
    /// "zoom_launcher.exe") for not flagging unrelated software.
    Exact,
    /// Substring match against the filename. Reserved for patterns long/
    /// distinctive enough that an accidental collision is implausible
    /// (e.g. "teamviewer", "virtualbox").
    Contains,
}

struct BlacklistEntry {
    category: ViolationCategory,
    critical: bool,
    mode: MatchMode,
    patterns: &'static [&'static str],
}

const BLACKLIST: &[BlacklistEntry] = &[
    BlacklistEntry {
        category: ViolationCategory::RemoteDesktop,
        critical: true,
        mode: MatchMode::Contains,
        patterns: &[
            "teamviewer",
            "anydesk",
            "rustdesk",
            "chrome_remote_desktop",
            "chromoting",
            "vncviewer",
            "tightvnc",
            "ultravnc",
            "splashtop",
            "parsec",
            "nomachine",
        ],
    },
    BlacklistEntry {
        category: ViolationCategory::RemoteDesktop,
        critical: true,
        // "mstsc" is short enough that exact-stem is the safer call, same
        // reasoning as the Communication/ScreenSharing exact-mode entries.
        mode: MatchMode::Exact,
        patterns: &["mstsc"],
    },
    BlacklistEntry {
        category: ViolationCategory::VirtualMachine,
        critical: true,
        mode: MatchMode::Contains,
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
        mode: MatchMode::Contains,
        patterns: &["discord", "streamlabs", "xsplit"],
    },
    BlacklistEntry {
        category: ViolationCategory::ScreenSharing,
        critical: false,
        // "zoom" collides with e.g. "PhotoZoomPro.exe"/"ZoomIn.exe"; "obs"
        // collides with "jobs.exe" (confirmed: "jobs".contains("obs")).
        mode: MatchMode::Exact,
        patterns: &["zoom", "obs", "obs64"],
    },
    BlacklistEntry {
        category: ViolationCategory::AiAssistant,
        critical: false,
        mode: MatchMode::Contains,
        patterns: &["chatgpt", "copilot", "claude"],
    },
    BlacklistEntry {
        category: ViolationCategory::ScreenCapture,
        critical: false,
        mode: MatchMode::Contains,
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
        mode: MatchMode::Contains,
        patterns: &["autohotkey", "tinytask", "jitbit"],
    },
    BlacklistEntry {
        category: ViolationCategory::Automation,
        critical: false,
        // "autoit" collides with e.g. "AutoItemManager.exe" (confirmed).
        mode: MatchMode::Exact,
        patterns: &["autoit"],
    },
    BlacklistEntry {
        category: ViolationCategory::Communication,
        critical: false,
        mode: MatchMode::Contains,
        patterns: &["whatsapp", "telegram"],
    },
    BlacklistEntry {
        category: ViolationCategory::Communication,
        critical: false,
        // "signal", "slack", "teams" are all real English words / common
        // name-fragments — confirmed collisions: "SignalProcessingHost",
        // "WindowsSlackerService", "teamspeak" all match under Contains.
        mode: MatchMode::Exact,
        patterns: &["signal", "slack", "teams"],
    },
];

/// Returns the first matching category + criticality for a process, or
/// `None` if it isn't on the blacklist.
///
/// Matches against the filename ONLY, never the full executable path — path
/// matching was the actual root cause of most realistic false positives
/// here: it means any candidate whose Windows username, install directory,
/// or unrelated installed software happens to contain a blacklisted
/// substring gets flagged. E.g. a candidate named "Claude" would have every
/// process under `C:\Users\Claude\...` match the AI-assistant pattern
/// "claude", regardless of what that process actually is.
pub fn classify(name: &str) -> Option<(ViolationCategory, bool)> {
    let name_l = name.to_lowercase();
    let stem_l = name_l.strip_suffix(".exe").unwrap_or(&name_l);
    for entry in BLACKLIST {
        let hit = entry.patterns.iter().copied().any(|pat| match entry.mode {
            MatchMode::Exact => stem_l == pat,
            MatchMode::Contains => name_l.contains(pat),
        });
        if hit {
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Regression test for the false-positive fix: these are all real,
    /// unrelated software whose filenames merely contain a blacklisted
    /// substring — confirmed by hand before the fix, must not classify.
    #[test]
    fn does_not_false_positive_on_substring_collisions() {
        for name in [
            "TeamSpeak.exe",
            "jobs.exe",
            "ProbSolver.exe",
            "SignalProcessingHost.exe",
            "WindowsSlackerService.exe",
            "AutoItemManager.exe",
            "PhotoZoomPro.exe",
            "ZoomIn.exe",
        ] {
            assert!(classify(name).is_none(), "{name} should not match the blacklist");
        }
    }

    /// The genuine blacklisted apps must still be caught after switching
    /// short/generic patterns to exact-stem matching.
    #[test]
    fn still_detects_genuine_blacklisted_apps() {
        for name in [
            "teamviewer.exe",
            "anydesk.exe",
            "mstsc.exe",
            "virtualbox.exe",
            "zoom.exe",
            "Obs.exe",
            "obs64.exe",
            "discord.exe",
            "claude.exe",
            "autoit.exe",
            "Signal.exe",
            "slack.exe",
            "Teams.exe",
        ] {
            assert!(classify(name).is_some(), "{name} should still match the blacklist");
        }
    }

    /// Path-matching was removed entirely — a username/folder containing a
    /// blacklisted word must not flag an unrelated process.
    #[test]
    fn ignores_path_entirely() {
        // classify() only ever takes a filename now (no exe_path param),
        // so there's nothing to pass a "poisoned" path into — this test
        // documents that guarantee rather than exercising a code branch.
        assert!(classify("notepad.exe").is_none());
    }
}
