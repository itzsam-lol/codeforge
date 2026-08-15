pub mod clipboard;
pub mod heartbeat;
pub mod integrity;
pub mod kiosk;
pub mod network_watcher;
pub mod process_monitor;
pub mod screen_guard;
pub mod system_info;
pub mod vm_detector;

// Phase 8 (webcam) not started — needs frontend getUserMedia + an actual
// upload target, deferred alongside the rest of Phase 10's API surface.
