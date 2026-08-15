use tauri::WebviewWindow;
use windows::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE};

/// Makes this window's content render as solid black in any screenshot or
/// screen-recording tool (PrintScreen, Snipping Tool, OBS, any BitBlt-based
/// capture) while it stays fully visible on the real physical display — the
/// same technique DRM video players use (`SetWindowDisplayAffinity` with
/// `WDA_EXCLUDEFROMCAPTURE`). Safe to run live: this only changes how THIS
/// app's own window is captured, nothing else on the system.
#[tauri::command]
pub fn enable_capture_protection(window: WebviewWindow) -> Result<(), String> {
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    unsafe { SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE) }.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn disable_capture_protection(window: WebviewWindow) -> Result<(), String> {
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    unsafe { SetWindowDisplayAffinity(hwnd, WDA_NONE) }.map_err(|e| e.to_string())
}
