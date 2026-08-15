use serde::Serialize;
use sha2::{Digest, Sha256};
use sysinfo::{Networks, System};
use windows::core::PCWSTR;
use windows::Win32::Storage::FileSystem::GetVolumeInformationW;
use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SystemFingerprint {
    pub cpu_brand: String,
    pub cpu_cores: usize,
    pub total_memory_mb: u64,
    pub display_resolution: String,
    pub primary_mac: Option<String>,
    pub os_name: String,
    pub os_version: String,
    pub hostname: String,
    pub disk_serial: Option<String>,
    /// SHA-256 of every field above, concatenated — the actual fingerprint
    /// to store alongside a TestSession server-side (Phase 10) and compare
    /// against on subsequent polls to catch drift (a new display appearing,
    /// a network adapter changing) or across sessions (same candidate,
    /// wildly different machine).
    pub hash: String,
}

/// GPU model deliberately omitted — sysinfo doesn't expose it, and getting
/// it via plain Win32 needs either DXGI enumeration or a WMI query, both
/// more surface than this fingerprint's other fields are worth matching.
#[tauri::command]
pub fn get_system_fingerprint() -> SystemFingerprint {
    let mut sys = System::new_all();
    sys.refresh_all();

    let cpu_brand = sys.cpus().first().map(|c| c.brand().to_string()).unwrap_or_default();
    let cpu_cores = sys.cpus().len();
    let total_memory_mb = sys.total_memory() / (1024 * 1024);
    let os_name = System::name().unwrap_or_else(|| "unknown".into());
    let os_version = System::os_version().unwrap_or_else(|| "unknown".into());
    let hostname = System::host_name().unwrap_or_else(|| "unknown".into());
    let display_resolution = display_resolution();
    let primary_mac = primary_mac_address();
    let disk_serial = disk_serial();

    let fingerprint_input = format!(
        "{cpu_brand}|{cpu_cores}|{total_memory_mb}|{display_resolution}|{}|{os_name}|{os_version}|{hostname}|{}",
        primary_mac.as_deref().unwrap_or(""),
        disk_serial.as_deref().unwrap_or("")
    );
    let hash = format!("{:x}", Sha256::digest(fingerprint_input.as_bytes()));

    SystemFingerprint {
        cpu_brand,
        cpu_cores,
        total_memory_mb,
        display_resolution,
        primary_mac,
        os_name,
        os_version,
        hostname,
        disk_serial,
        hash,
    }
}

fn display_resolution() -> String {
    let width = unsafe { GetSystemMetrics(SM_CXSCREEN) };
    let height = unsafe { GetSystemMetrics(SM_CYSCREEN) };
    format!("{width}x{height}")
}

fn primary_mac_address() -> Option<String> {
    let networks = Networks::new_with_refreshed_list();
    networks
        .values()
        .map(|data| data.mac_address().to_string())
        .find(|mac| mac != "00:00:00:00:00:00" && !mac.is_empty())
}

fn disk_serial() -> Option<String> {
    // Built explicitly as a PCWSTR (null-terminated UTF-16) rather than
    // relying on windows-rs's `&str` ergonomic Param impl — this crate tree
    // has two different windows-core versions in it (tao/muda pin 0.57,
    // this file's direct `windows = "0.61"` dep is separate), which breaks
    // that blanket impl's trait resolution. Passing a concrete PCWSTR
    // sidesteps the ambiguity entirely.
    let wide: Vec<u16> = "C:\\\0".encode_utf16().collect();
    let mut serial: u32 = 0;
    let result =
        unsafe { GetVolumeInformationW(PCWSTR::from_raw(wide.as_ptr()), None, Some(&mut serial), None, None, None) };
    result.ok().map(|_| format!("{serial:08X}"))
}
