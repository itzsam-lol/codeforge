// Prevents an extra console window from appearing alongside the app window
// on Windows release builds; debug builds keep it for println!/log output.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    codeforge_sentinel_lib::run();
}
