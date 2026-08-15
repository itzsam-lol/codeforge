use std::sync::atomic::{AtomicBool, Ordering};

/// Runtime-configurable proctoring behavior. Currently just an in-memory
/// toggle set via the `set_auto_terminate_on_hard_violation` command — real
/// wiring to a per-test recruiter setting (`requireSentinel`-style config
/// pulled from the CodeForge API) is Phase 10 work, not started yet.
pub struct SentinelConfig {
    /// Applies to every Hard-severity violation — both a critical-category
    /// process (blocked on sight) and a soft violation whose 30s grace
    /// period expired without the candidate closing it themselves.
    auto_terminate_on_hard_violation: AtomicBool,
}

impl SentinelConfig {
    pub fn new() -> Self {
        // Off by default: auto-terminating a candidate's process is a strong
        // action that should be an explicit opt-in, not a silent default.
        Self {
            auto_terminate_on_hard_violation: AtomicBool::new(false),
        }
    }

    pub fn auto_terminate_on_hard_violation(&self) -> bool {
        self.auto_terminate_on_hard_violation.load(Ordering::Relaxed)
    }

    pub fn set_auto_terminate_on_hard_violation(&self, value: bool) {
        self.auto_terminate_on_hard_violation
            .store(value, Ordering::Relaxed);
    }
}
