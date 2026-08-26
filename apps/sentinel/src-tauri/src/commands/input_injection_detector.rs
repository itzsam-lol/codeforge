//! Detects low-level keyboard/mouse input-injection tooling: kernel filter
//! drivers and virtual HID devices that synthesize input below what a normal
//! application-level hook can distinguish from real hardware, plus known
//! remote-input host windows/processes. Same composite-evidence-scoring
//! shape as `vm_detector.rs` — independent signals, each capped, summed and
//! clamped to 0-100, so no single ambiguous hit trips a false positive on
//! its own.
//!
//! Real kernel anti-cheats (e.g. Vanguard, EAC) are documented to refuse to
//! boot outright when a low-level input-injection driver is loaded — that's
//! the precedent this mirrors: driver/service presence is scored highest,
//! since (unlike a process name) it can't be avoided by renaming an exe.

use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InputInjectionResult {
    pub detected: bool,
    /// 0-100, see module doc comment.
    pub confidence: u8,
    pub evidence: Vec<String>,
}

/// Filter-driver service names a known low-level keyboard/mouse injection
/// driver package installs under `SYSTEM\CurrentControlSet\Services`, and
/// registers as upper filters on the standard HID keyboard/mouse device
/// classes. Matched case-insensitively; kept generic in comments/naming
/// rather than referencing any specific vendor by name in strings that
/// would end up in a support/log export.
const INJECTION_FILTER_SERVICE_NAMES: &[&str] = &["keyboard", "mouse"];

/// A virtual-HID hardware-ID substring belonging to a known public
/// synthetic-input driver package, matched against SetupAPI's
/// SPDRP_HARDWAREID for every present HID device interface.
const VIRTUAL_HID_HARDWARE_ID_MARKERS: &[&str] = &["fakerinput"];

/// A DLL module name, matched against every loaded module of every running
/// process — the most robust signal here, since it's the one artifact that
/// survives renaming the host executable itself.
const INJECTION_MODULE_MARKERS: &[&str] = &["interception.dll"];

/// Win32 window class names known to belong to a remote-input host
/// application. Cheapest, weakest signal — trivially changed in a future
/// build, so scored low and never sufficient alone.
const REMOTE_HOST_WINDOW_CLASSES: &[&str] = &["RemoteDesktopHostClass"];

#[tauri::command]
pub fn detect_input_injection_tools() -> InputInjectionResult {
    let mut evidence = Vec::new();
    let mut score: u32 = 0;

    #[cfg(target_os = "windows")]
    {
        score += check_filter_driver_services(&mut evidence);
        score += check_virtual_hid_devices(&mut evidence);
        score += check_loaded_modules(&mut evidence);
        score += check_window_classes(&mut evidence);
    }

    let confidence = score.min(100) as u8;
    InputInjectionResult {
        detected: confidence >= 50,
        confidence,
        evidence,
    }
}

/// Scans `SYSTEM\CurrentControlSet\Services` for a service matching a known
/// injection-driver filter name, same enumeration shape as
/// `vm_detector.rs::check_registry`'s VM-services check. Deliberately does
/// NOT check the HID/keyboard/mouse device class `UpperFilters`/
/// `LowerFilters` values by device-instance subkey — that requires walking
/// every present device instance under the class key (more invasive, more
/// fragile across Windows versions) for the same signal the service-list
/// scan already gives more cheaply: the driver has to be installed as a
/// service either way.
#[cfg(target_os = "windows")]
fn check_filter_driver_services(evidence: &mut Vec<String>) -> u32 {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let Ok(services) = hklm.open_subkey(r"SYSTEM\CurrentControlSet\Services") else {
        return 0;
    };

    let mut score = 0;
    for key_name in services.enum_keys().filter_map(|k| k.ok()) {
        if !INJECTION_FILTER_SERVICE_NAMES
            .iter()
            .any(|marker| key_name.eq_ignore_ascii_case(marker))
        {
            continue;
        }
        // The names in INJECTION_FILTER_SERVICE_NAMES ("keyboard", "mouse")
        // are also the literal service names Windows' own built-in
        // kbdclass/mouclass drivers could theoretically use — guard against
        // that by requiring the service's ImagePath to NOT point into
        // System32\drivers (where every legitimate in-box driver lives).
        let Ok(svc) = services.open_subkey(&key_name) else { continue };
        let image_path: String = svc.get_value("ImagePath").unwrap_or_default();
        let lower = image_path.to_lowercase();
        if !lower.is_empty() && !lower.contains(r"system32\drivers") {
            evidence.push(format!(
                "service \"{key_name}\" (ImagePath: \"{image_path}\") matches a known low-level input-injection filter driver, installed outside the standard driver directory"
            ));
            score += 60;
        }
    }
    score.min(70)
}

/// FakerInput detection, the publicly documented algorithm: enumerate
/// present HID device interfaces via SetupAPI and match each device's
/// hardware-ID string.
#[cfg(target_os = "windows")]
fn check_virtual_hid_devices(evidence: &mut Vec<String>) -> u32 {
    use windows::core::GUID;
    use windows::Win32::Devices::DeviceAndDriverInstallation::{
        SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInfo, SetupDiGetClassDevsW,
        SetupDiGetDeviceRegistryPropertyW, DIGCF_ALLCLASSES, DIGCF_PRESENT, SPDRP_HARDWAREID,
        SP_DEVINFO_DATA,
    };
    use windows::Win32::Devices::HumanInterfaceDevice::HidD_GetHidGuid;

    let hid_guid: GUID = unsafe { HidD_GetHidGuid() };

    let device_info_set = unsafe {
        SetupDiGetClassDevsW(Some(&hid_guid), None, None, DIGCF_PRESENT | DIGCF_ALLCLASSES)
    };
    let Ok(device_info_set) = device_info_set else {
        return 0;
    };
    if device_info_set.is_invalid() {
        return 0;
    }

    let mut score = 0;
    let mut index = 0u32;
    loop {
        let mut devinfo = SP_DEVINFO_DATA {
            cbSize: std::mem::size_of::<SP_DEVINFO_DATA>() as u32,
            ..Default::default()
        };
        let ok = unsafe { SetupDiEnumDeviceInfo(device_info_set, index, &mut devinfo) };
        if ok.is_err() {
            break; // ERROR_NO_MORE_ITEMS once we've walked every device
        }
        index += 1;

        let mut buf = [0u16; 512];
        let mut required_size: u32 = 0;
        let read_ok = unsafe {
            SetupDiGetDeviceRegistryPropertyW(
                device_info_set,
                &devinfo,
                SPDRP_HARDWAREID,
                None,
                Some(bytemuck_u16_as_u8_mut(&mut buf)),
                Some(&mut required_size),
            )
        };
        if read_ok.is_err() {
            continue;
        }
        let hardware_id = String::from_utf16_lossy(&buf)
            .trim_end_matches('\0')
            .to_string();
        let lower = hardware_id.to_lowercase();
        if VIRTUAL_HID_HARDWARE_ID_MARKERS
            .iter()
            .any(|marker| lower.contains(marker))
        {
            evidence.push(format!(
                "HID device hardware ID \"{hardware_id}\" matches a known virtual/synthetic input device"
            ));
            score += 60;
            break;
        }
    }

    let _ = unsafe { SetupDiDestroyDeviceInfoList(device_info_set) };
    score.min(60)
}

/// Reinterprets a `&mut [u16]` as `&mut [u8]` for the SetupAPI call, which
/// wants a raw byte buffer — safe because u16 has no padding/alignment
/// requirement stricter than what a `[u16; N]` array already satisfies for
/// byte access, and the slice length just doubles.
#[cfg(target_os = "windows")]
fn bytemuck_u16_as_u8_mut(buf: &mut [u16]) -> &mut [u8] {
    let len = buf.len() * 2;
    unsafe { std::slice::from_raw_parts_mut(buf.as_mut_ptr() as *mut u8, len) }
}

/// Per-process loaded-module scan for a known injection-library DLL name —
/// the most robust signal, since it targets the artifact a renamed host exe
/// still has to load to actually inject input.
#[cfg(target_os = "windows")]
fn check_loaded_modules(evidence: &mut Vec<String>) -> u32 {
    use windows::Win32::Foundation::{CloseHandle, HMODULE};
    use windows::Win32::System::ProcessStatus::{EnumProcessModules, GetModuleBaseNameW};
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
    };

    let mut sys = sysinfo::System::new_all();
    sys.refresh_all();

    let mut score = 0;
    for (pid, process) in sys.processes() {
        let Ok(handle) = (unsafe {
            OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid.as_u32())
        }) else {
            continue;
        };

        let mut modules = [HMODULE::default(); 256];
        let mut bytes_needed: u32 = 0;
        let enum_ok = unsafe {
            EnumProcessModules(
                handle,
                modules.as_mut_ptr(),
                (modules.len() * std::mem::size_of::<HMODULE>()) as u32,
                &mut bytes_needed,
            )
        };
        if enum_ok.is_ok() {
            let count = (bytes_needed as usize / std::mem::size_of::<HMODULE>()).min(modules.len());
            for module in &modules[..count] {
                let mut name_buf = [0u16; 260];
                let len = unsafe { GetModuleBaseNameW(handle, Some(*module), &mut name_buf) };
                if len == 0 {
                    continue;
                }
                let name = String::from_utf16_lossy(&name_buf[..len as usize]).to_lowercase();
                if INJECTION_MODULE_MARKERS.iter().any(|marker| name == *marker) {
                    evidence.push(format!(
                        "process \"{}\" (pid {}) has loaded a known low-level input-injection library",
                        process.name().to_string_lossy(),
                        pid.as_u32()
                    ));
                    score += 70;
                }
            }
        }
        let _ = unsafe { CloseHandle(handle) };
    }
    score.min(70)
}

/// Window-class enumeration for a known remote-input-host window. Weakest
/// signal (renamed trivially in a future build) — never scored high enough
/// to trip `detected` on its own.
#[cfg(target_os = "windows")]
fn check_window_classes(evidence: &mut Vec<String>) -> u32 {
    use std::cell::RefCell;
    use windows::core::BOOL;
    use windows::Win32::Foundation::LPARAM;
    use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetClassNameW};

    thread_local! {
        static FOUND: RefCell<Vec<String>> = const { RefCell::new(Vec::new()) };
    }
    FOUND.with(|f| f.borrow_mut().clear());

    unsafe extern "system" fn enum_proc(hwnd: windows::Win32::Foundation::HWND, _lparam: LPARAM) -> BOOL {
        let mut buf = [0u16; 256];
        let len = unsafe { GetClassNameW(hwnd, &mut buf) };
        if len > 0 {
            let class_name = String::from_utf16_lossy(&buf[..len as usize]);
            if REMOTE_HOST_WINDOW_CLASSES.iter().any(|c| c.eq_ignore_ascii_case(&class_name)) {
                FOUND.with(|f| f.borrow_mut().push(class_name));
            }
        }
        BOOL::from(true) // keep enumerating
    }

    let _ = unsafe { EnumWindows(Some(enum_proc), LPARAM(0)) };

    let hits = FOUND.with(|f| f.borrow().clone());
    let mut score = 0;
    for class_name in hits {
        evidence.push(format!("window class \"{class_name}\" matches a known remote-input host"));
        score += 20;
    }
    score.min(20)
}

#[cfg(not(target_os = "windows"))]
fn check_filter_driver_services(_evidence: &mut Vec<String>) -> u32 {
    0
}
#[cfg(not(target_os = "windows"))]
fn check_virtual_hid_devices(_evidence: &mut Vec<String>) -> u32 {
    0
}
#[cfg(not(target_os = "windows"))]
fn check_loaded_modules(_evidence: &mut Vec<String>) -> u32 {
    0
}
#[cfg(not(target_os = "windows"))]
fn check_window_classes(_evidence: &mut Vec<String>) -> u32 {
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    /// On this dev machine, before the analyzed sample is ever launched,
    /// the detector must come back clean — establishes the negative
    /// baseline (can't assert `detected: true` without the tool actually
    /// running, which this test suite never does).
    #[test]
    fn clean_baseline_on_dev_machine() {
        let result = detect_input_injection_tools();
        assert!(
            result.confidence < 50,
            "unexpected detection on a clean dev machine: {:?}",
            result.evidence
        );
    }
}
