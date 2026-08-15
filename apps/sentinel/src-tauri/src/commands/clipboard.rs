use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use windows::Win32::System::DataExchange::{CloseClipboard, EmptyClipboard, GetClipboardSequenceNumber, OpenClipboard};

pub struct ClipboardGuardState {
    active: AtomicBool,
}

impl ClipboardGuardState {
    pub fn new() -> Self {
        Self { active: AtomicBool::new(false) }
    }
}

const CLIPBOARD_CLEARED_EVENT: &str = "sentinel://clipboard-cleared";
const POLL_INTERVAL: Duration = Duration::from_millis(300);

/// Polls `GetClipboardSequenceNumber` (a counter the OS bumps on every
/// clipboard content change) and wipes the clipboard the instant it changes
/// while lockdown is active. Deliberately polling rather than the "correct"
/// `AddClipboardFormatListener` approach — that needs a WM_CLIPBOARDUPDATE
/// message delivered to a window procedure, meaning subclassing Tauri's own
/// WndProc, a much more invasive change on top of Tauri's window management
/// for a first pass. 300ms polling is simple, safe, and plenty responsive —
/// nothing meaningful can be pasted out in that window since the source
/// content is still sitting right there un-pasted.
///
/// Starts inactive; `set_clipboard_lockdown(true)` is a separate opt-in
/// command, same pattern as Phase 2's auto-terminate default-off.
pub fn spawn(app: AppHandle, state: Arc<ClipboardGuardState>) {
    thread::spawn(move || {
        let mut last_seq = unsafe { GetClipboardSequenceNumber() };
        loop {
            thread::sleep(POLL_INTERVAL);
            let seq = unsafe { GetClipboardSequenceNumber() };
            if seq == last_seq {
                continue;
            }
            last_seq = seq;
            if !state.active.load(Ordering::Relaxed) {
                continue;
            }
            if clear_clipboard().is_ok() {
                let _ = app.emit(CLIPBOARD_CLEARED_EVENT, ());
                // Re-sync: wiping the clipboard itself bumps the sequence
                // number, which would otherwise look like another external
                // change on the next tick.
                last_seq = unsafe { GetClipboardSequenceNumber() };
            }
        }
    });
}

fn clear_clipboard() -> Result<(), String> {
    unsafe {
        OpenClipboard(None).map_err(|e| e.to_string())?;
        let result = EmptyClipboard().map_err(|e| e.to_string());
        let _ = CloseClipboard();
        result
    }
}

#[tauri::command]
pub fn set_clipboard_lockdown(enabled: bool, state: tauri::State<'_, Arc<ClipboardGuardState>>) {
    state.active.store(enabled, Ordering::Relaxed);
}

#[tauri::command]
pub fn is_clipboard_lockdown_active(state: tauri::State<'_, Arc<ClipboardGuardState>>) -> bool {
    state.active.load(Ordering::Relaxed)
}

#[tauri::command]
pub fn clear_clipboard_now() -> Result<(), String> {
    clear_clipboard()
}
