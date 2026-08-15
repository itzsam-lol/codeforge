pub mod clipboard;
pub mod kiosk;
pub mod process_monitor;
pub mod screen_guard;
pub mod system_info;
pub mod vm_detector;

// Later phases add their command modules here, one per src-tauri/src/
// commands/*.rs file per the project structure in the implementation plan:
// network_watcher, webcam, integrity.
