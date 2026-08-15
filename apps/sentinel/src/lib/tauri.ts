import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

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

// ---------------------------------------------------------------------------
// Phase 2: process monitor / blacklist engine
// ---------------------------------------------------------------------------

export interface ProcessInfo {
  pid: number;
  name: string;
  exePath: string | null;
  parentPid: number | null;
  cpuUsage: number;
  memoryKb: number;
  /** Unix seconds. */
  startTime: number;
}

export type ViolationCategory =
  | "remoteDesktop"
  | "screenSharing"
  | "virtualMachine"
  | "aiAssistant"
  | "screenCapture"
  | "automation"
  | "communication"
  | "orphaned";

export type Severity = "soft" | "hard";

export interface Violation {
  id: string;
  category: ViolationCategory;
  processName: string;
  pid: number;
  severity: Severity;
  /** Unix milliseconds. */
  detectedAtMs: number;
  terminated: boolean;
}

const VIOLATION_EVENT = "sentinel://violation";

export async function getRunningProcesses(): Promise<ProcessInfo[]> {
  return invoke<ProcessInfo[]>("get_running_processes");
}

export async function getBlacklistViolations(): Promise<Violation[]> {
  return invoke<Violation[]>("get_blacklist_violations");
}

export async function killProcess(pid: number): Promise<void> {
  return invoke<void>("kill_process", { pid });
}

export async function setAutoTerminateOnHardViolation(enabled: boolean): Promise<void> {
  return invoke<void>("set_auto_terminate_on_hard_violation", { enabled });
}

/** Live feed of violations as the Rust watchdog detects them, not just the polled snapshot. */
export function onViolation(callback: (violation: Violation) => void): Promise<UnlistenFn> {
  return listen<Violation>(VIOLATION_EVENT, (event) => callback(event.payload));
}

// ---------------------------------------------------------------------------
// Phase 3: VM / sandbox detection
// ---------------------------------------------------------------------------

export interface VmDetectionResult {
  isVm: boolean;
  /** 0-100, combined from multiple independent signals. */
  confidence: number;
  evidence: string[];
}

export async function detectVirtualMachine(): Promise<VmDetectionResult> {
  return invoke<VmDetectionResult>("detect_virtual_machine");
}

// ---------------------------------------------------------------------------
// Phase 4: kiosk mode (fullscreen toggle + display count are safe/live-
// tested; the global hotkey-block hook exists on the Rust side but is
// intentionally NOT exposed here yet — see kiosk.rs's doc comment on why.)
// ---------------------------------------------------------------------------

export async function enterKioskWindow(): Promise<void> {
  return invoke<void>("enter_kiosk_window");
}

export async function exitKioskWindow(): Promise<void> {
  return invoke<void>("exit_kiosk_window");
}

export async function getDisplayCount(): Promise<number> {
  return invoke<number>("get_display_count");
}

// ---------------------------------------------------------------------------
// Phase 5: screen capture protection
// ---------------------------------------------------------------------------

export async function enableCaptureProtection(): Promise<void> {
  return invoke<void>("enable_capture_protection");
}

export async function disableCaptureProtection(): Promise<void> {
  return invoke<void>("disable_capture_protection");
}

// ---------------------------------------------------------------------------
// Phase 6: clipboard lockdown
// ---------------------------------------------------------------------------

export async function setClipboardLockdown(enabled: boolean): Promise<void> {
  return invoke<void>("set_clipboard_lockdown", { enabled });
}

export async function isClipboardLockdownActive(): Promise<boolean> {
  return invoke<boolean>("is_clipboard_lockdown_active");
}

export async function clearClipboardNow(): Promise<void> {
  return invoke<void>("clear_clipboard_now");
}

export function onClipboardCleared(callback: () => void): Promise<UnlistenFn> {
  return listen("sentinel://clipboard-cleared", () => callback());
}
