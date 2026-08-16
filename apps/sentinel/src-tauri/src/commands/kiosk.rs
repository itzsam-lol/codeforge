use std::sync::atomic::{AtomicU32, Ordering};
use std::thread;
use tauri::WebviewWindow;
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, PostThreadMessageW, SetWindowsHookExW,
    TranslateMessage, UnhookWindowsHookEx, GetSystemMetrics, HC_ACTION, KBDLLHOOKSTRUCT,
    LLKHF_ALTDOWN, MSG, SM_CMONITORS, WH_KEYBOARD_LL, WM_KEYDOWN, WM_QUIT, WM_SYSKEYDOWN,
};

/// Whether the global low-level keyboard hook is currently running, and
/// which OS thread owns it (needed to post it a WM_QUIT to stop cleanly —
/// see `uninstall_hotkey_lock`). 0 = not running.
///
/// IMPORTANT — NOT wired to run automatically anywhere, and not exercised
/// against a live desktop by whoever built this (see the Sentinel README):
/// this installs a genuine system-wide low-level keyboard hook that blocks
/// Alt+Tab, the Windows key, Alt+F4, Alt+Esc, and PrintScreen for the
/// entire OS, not just this app's window, for as long as it's installed.
/// That's real and disruptive by design (it's a kiosk lockdown), which
/// means it's also real and disruptive if something about it is wrong.
/// Compile-checked (`cargo check`/`cargo clippy`) but not run — treat it as
/// unverified until it's actually been exercised, ideally on a disposable
/// VM rather than a primary machine.
static HOTKEY_HOOK_THREAD_ID: AtomicU32 = AtomicU32::new(0);

// Deliberately conservative blocklist — the spec's fuller list also
// mentions Ctrl+Alt+Del ("show warning instead" per its own note, since
// SAS is protected at the OS level and a normal hook can't intercept it
// anyway) and Ctrl+Shift+Esc (Task Manager — handled by Phase 2's process
// blacklist terminating taskmgr.exe on sight instead, not a hotkey block).
const VK_TAB: u32 = 0x09;
const VK_ESCAPE: u32 = 0x1B;
const VK_LWIN: u32 = 0x5B;
const VK_RWIN: u32 = 0x5C;
const VK_F4: u32 = 0x73;
const VK_SNAPSHOT: u32 = 0x2C; // PrintScreen

unsafe extern "system" fn low_level_keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        let msg = wparam.0 as u32;
        if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN {
            let kb = unsafe { &*(lparam.0 as *const KBDLLHOOKSTRUCT) };
            let alt_down = kb.flags.contains(LLKHF_ALTDOWN);
            let blocked = matches!(
                (kb.vkCode, alt_down),
                (VK_TAB, true)      // Alt+Tab
                | (VK_ESCAPE, true) // Alt+Esc
                | (VK_F4, true)     // Alt+F4
            ) || matches!(kb.vkCode, VK_LWIN | VK_RWIN | VK_SNAPSHOT);
            if blocked {
                // Non-zero return = "swallow this keystroke", the OS never
                // sees it.
                return LRESULT(1);
            }
        }
    }
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

/// Installs the hook on a dedicated background thread that does nothing but
/// pump a message loop — a low-level (*_LL) hook only fires on a thread that
/// is actively pumping messages, so this can't just run on whatever thread
/// calls this command.
#[tauri::command]
pub fn install_hotkey_lock() -> Result<(), String> {
    // A placeholder value (u32::MAX can never be a real thread ID) claims
    // the "installing" state atomically — plain load-then-spawn had a gap
    // where two concurrent calls could both pass the check before either
    // set it, installing two hooks and losing track of one (it could never
    // be uninstalled again, its thread ID overwritten by whichever spawn
    // finished second). compare_exchange closes that window; the real
    // thread ID is stored once the hook is actually up, further down.
    if HOTKEY_HOOK_THREAD_ID
        .compare_exchange(0, u32::MAX, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Hotkey lock is already installed".into());
    }

    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();

    thread::spawn(move || {
        let thread_id = unsafe { GetCurrentThreadId() };

        let hook = unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(low_level_keyboard_proc), None, 0) };
        let hook = match hook {
            Ok(h) => h,
            Err(e) => {
                // Release the placeholder so a failed attempt doesn't
                // permanently block every future install_hotkey_lock call.
                HOTKEY_HOOK_THREAD_ID.store(0, Ordering::SeqCst);
                let _ = tx.send(Err(e.to_string()));
                return;
            }
        };

        HOTKEY_HOOK_THREAD_ID.store(thread_id, Ordering::SeqCst);
        let _ = tx.send(Ok(()));

        let mut msg = MSG::default();
        // Exits when uninstall_hotkey_lock posts WM_QUIT to this thread.
        while unsafe { GetMessageW(&mut msg, None, 0, 0) }.as_bool() {
            unsafe {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }

        let _ = unsafe { UnhookWindowsHookEx(hook) };
        HOTKEY_HOOK_THREAD_ID.store(0, Ordering::SeqCst);
    });

    rx.recv().map_err(|_| "Hook thread died before reporting status".to_string())?
}

#[tauri::command]
pub fn uninstall_hotkey_lock() -> Result<(), String> {
    let thread_id = HOTKEY_HOOK_THREAD_ID.load(Ordering::SeqCst);
    if thread_id == 0 {
        return Ok(()); // already not running
    }
    unsafe { PostThreadMessageW(thread_id, WM_QUIT, WPARAM(0), LPARAM(0)) }.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn is_hotkey_lock_active() -> bool {
    HOTKEY_HOOK_THREAD_ID.load(Ordering::SeqCst) != 0
}

// ---------------------------------------------------------------------------
// Fullscreen/always-on-top toggle — plain Tauri window API, cross-platform,
// fully reversible, no OS hooks. Safe to exercise live (it's the same thing
// as any app entering/exiting fullscreen).
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn enter_kiosk_window(window: WebviewWindow) -> Result<(), String> {
    window.set_fullscreen(true).map_err(|e| e.to_string())?;
    window.set_always_on_top(true).map_err(|e| e.to_string())?;
    window.set_decorations(false).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn exit_kiosk_window(window: WebviewWindow) -> Result<(), String> {
    window.set_always_on_top(false).map_err(|e| e.to_string())?;
    window.set_decorations(true).map_err(|e| e.to_string())?;
    window.set_fullscreen(false).map_err(|e| e.to_string())
}

/// Read-only, safe: GetSystemMetrics(SM_CMONITORS) is a query, no side effects.
#[tauri::command]
pub fn get_display_count() -> i32 {
    unsafe { GetSystemMetrics(SM_CMONITORS) }
}
