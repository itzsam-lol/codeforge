use serde::Serialize;

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ViolationCategory {
    RemoteDesktop,
    ScreenSharing,
    VirtualMachine,
    AiAssistant,
    ScreenCapture,
    Automation,
    Communication,
    /// A running process whose parent PID no longer exists — not itself
    /// blacklisted, but worth surfacing (see Phase 2's zombie/orphan note).
    Orphaned,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Severity {
    /// Logged, candidate warned, no action taken yet.
    Soft,
    /// Either a critical-category process (remote desktop / VM tooling,
    /// blocked on sight) or a soft violation whose 30s grace period expired.
    Hard,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Violation {
    pub id: String,
    pub category: ViolationCategory,
    pub process_name: String,
    pub pid: u32,
    pub severity: Severity,
    /// Unix milliseconds.
    pub detected_at_ms: u64,
    pub terminated: bool,
}
