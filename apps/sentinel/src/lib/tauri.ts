import { invoke } from "@tauri-apps/api/core";

/**
 * Typed wrappers around Tauri IPC — every `#[tauri::command]` added on the
 * Rust side should get a matching entry here rather than calling `invoke()`
 * with a bare string elsewhere, so a renamed/removed command is a type error
 * at the call site instead of a silent runtime failure.
 */

export interface SystemInfo {
  osName: string;
  osVersion: string;
  hostname: string;
}

export async function getSystemInfo(): Promise<SystemInfo> {
  return invoke<SystemInfo>("get_system_info");
}
