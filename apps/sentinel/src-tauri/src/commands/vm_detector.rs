use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VmDetectionResult {
    pub is_vm: bool,
    /// 0-100, built from multiple independent signals rather than a single
    /// yes/no check — more accurate, and lets one ambiguous signal (see the
    /// CPUID vendor-string comment below) not trigger a false positive on
    /// its own.
    pub confidence: u8,
    pub evidence: Vec<String>,
}

const VM_STRING_MARKERS: &[&str] = &["vmware", "virtualbox", "vbox", "qemu", "kvm", "xen"];

const VM_SERVICE_NAMES: &[&str] = &[
    "vboxguest",
    "vboxsf",
    "vboxvideo",
    "vboxservice",
    "vboxmouse",
    "vmci",
    "vmhgfs",
    "vmmouse",
    "vmxnet3",
    "vm3dmp",
    "vmusbmouse",
    "vmtools",
];

const VM_ARTIFACT_PATHS: &[&str] = &[
    r"C:\Windows\System32\drivers\vmmouse.sys",
    r"C:\Windows\System32\drivers\vmhgfs.sys",
    r"C:\Windows\System32\drivers\VBoxMouse.sys",
    r"C:\Windows\System32\drivers\VBoxGuest.sys",
    r"C:\Windows\System32\drivers\VBoxSF.sys",
    r"C:\Program Files\VMware\VMware Tools",
    r"C:\Program Files\Oracle\VirtualBox Guest Additions",
];

const VM_MAC_PREFIXES: &[&str] = &[
    "00:0c:29", // VMware
    "00:50:56", // VMware
    "08:00:27", // VirtualBox
    "00:15:5d", // Hyper-V
    "52:54:00", // QEMU/KVM
];

#[tauri::command]
pub fn detect_virtual_machine() -> VmDetectionResult {
    let mut evidence = Vec::new();
    let mut score: u32 = 0;

    score += check_cpuid(&mut evidence);
    score += check_mac_addresses(&mut evidence);
    #[cfg(target_os = "windows")]
    {
        score += check_registry(&mut evidence);
        score += check_filesystem_artifacts(&mut evidence);
    }

    let confidence = score.min(100) as u8;
    VmDetectionResult {
        is_vm: confidence >= 50,
        confidence,
        evidence,
    }
}

/// CPUID leaf 1 ECX bit 31 ("hypervisor present") + leaf 0x40000000 (the
/// 12-byte hypervisor vendor id string, if the bit is set).
///
/// IMPORTANT caveat, why this alone isn't scored high enough to trigger
/// `is_vm`: Windows 11's built-in Virtualization-Based Security (VBS / Core
/// Isolation / Credential Guard) runs a thin Hyper-V layer on plenty of
/// physical machines — it's on by default on most new Windows 11 hardware.
/// That sets this exact same bit and reports vendor id "Microsoft Hv", even
/// though the OS is running directly on bare metal, not inside a guest. A
/// real hypervisor vendor id (VMware/VirtualBox/QEMU/Xen/Parallels/bhyve) is
/// NOT ambiguous the same way — none of those show up on an unvirtualized
/// Windows install — so those score much higher.
#[cfg(target_arch = "x86_64")]
fn check_cpuid(evidence: &mut Vec<String>) -> u32 {
    use std::arch::x86_64::__cpuid;

    let leaf1 = __cpuid(1);
    let hypervisor_present = (leaf1.ecx & (1 << 31)) != 0;
    if !hypervisor_present {
        return 0;
    }

    let vendor_leaf = __cpuid(0x4000_0000);
    let vendor = cpuid_regs_to_ascii(vendor_leaf.ebx, vendor_leaf.ecx, vendor_leaf.edx);
    let vendor_trimmed = vendor.trim();

    const UNAMBIGUOUS_VENDORS: &[&str] = &[
        "VMwareVMware",
        "VBoxVBoxVBox",
        "KVMKVMKVM",
        "TCGTCGTCGTCG", // QEMU (TCG accelerator)
        "XenVMMXenVMM",
        " prl hyperv", // Parallels
        "bhyve bhyve",
    ];

    if UNAMBIGUOUS_VENDORS
        .iter()
        .any(|v| vendor_trimmed.eq_ignore_ascii_case(v))
    {
        evidence.push(format!(
            "CPUID hypervisor vendor id: \"{vendor_trimmed}\" (not seen on physical hardware)"
        ));
        70
    } else if vendor_trimmed.eq_ignore_ascii_case("Microsoft Hv") {
        evidence.push(
            "CPUID hypervisor-present bit set, vendor \"Microsoft Hv\" — ambiguous on its own \
             (Windows 11's Virtualization-Based Security sets this on many physical machines too)"
                .to_string(),
        );
        20
    } else if !vendor_trimmed.is_empty() {
        evidence.push(format!(
            "CPUID hypervisor-present bit set, unrecognized vendor id: \"{vendor_trimmed}\""
        ));
        35
    } else {
        evidence.push("CPUID hypervisor-present bit set, no vendor id reported".to_string());
        25
    }
}

#[cfg(not(target_arch = "x86_64"))]
fn check_cpuid(_evidence: &mut Vec<String>) -> u32 {
    0
}

fn cpuid_regs_to_ascii(ebx: u32, ecx: u32, edx: u32) -> String {
    let mut bytes = Vec::with_capacity(12);
    bytes.extend_from_slice(&ebx.to_le_bytes());
    bytes.extend_from_slice(&ecx.to_le_bytes());
    bytes.extend_from_slice(&edx.to_le_bytes());
    String::from_utf8_lossy(&bytes).into_owned()
}

/// Network adapter MAC address vendor-prefix match. Cross-platform via
/// sysinfo, unlike the registry/filesystem checks below.
///
/// Observed in practice: a physical machine with Hyper-V-backed WSL2/Docker
/// Desktop enabled gets its own "vEthernet (WSL ...)" virtual adapter with a
/// Hyper-V-prefixed MAC (00:15:5d:...) — that's the *host's* virtual switch,
/// not evidence the OS itself is a guest. This is exactly why this signal is
/// capped at 20 points rather than treated as conclusive on its own; combined
/// with an ambiguous CPUID "Microsoft Hv" hit (also 20) it still lands at 40,
/// under the 50-point block threshold.
fn check_mac_addresses(evidence: &mut Vec<String>) -> u32 {
    let networks = sysinfo::Networks::new_with_refreshed_list();
    for (name, data) in networks.iter() {
        let mac = data.mac_address().to_string().to_lowercase();
        if VM_MAC_PREFIXES.iter().any(|prefix| mac.starts_with(prefix)) {
            evidence.push(format!(
                "network adapter \"{name}\" MAC {mac} matches a known VM vendor prefix"
            ));
            return 20;
        }
    }
    0
}

#[cfg(target_os = "windows")]
fn check_registry(evidence: &mut Vec<String>) -> u32 {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let mut score = 0;
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    if let Ok(bios) = hklm.open_subkey(r"HARDWARE\DESCRIPTION\System\BIOS") {
        let manufacturer = bios
            .get_value::<String, _>("SystemManufacturer")
            .unwrap_or_default();
        let product = bios
            .get_value::<String, _>("SystemProductName")
            .unwrap_or_default();
        let bios_vendor = bios.get_value::<String, _>("BIOSVendor").unwrap_or_default();

        for (field, value) in [
            ("SystemManufacturer", &manufacturer),
            ("SystemProductName", &product),
            ("BIOSVendor", &bios_vendor),
        ] {
            let lower = value.to_lowercase();
            if VM_STRING_MARKERS.iter().any(|marker| lower.contains(marker)) {
                evidence.push(format!("registry {field} = \"{value}\""));
                score += 25;
            }
        }

        // Hyper-V's specific signature: manufacturer + product together,
        // NOT manufacturer alone (real Microsoft Surface hardware also
        // reports "Microsoft Corporation" as the manufacturer).
        if manufacturer.to_lowercase().contains("microsoft corporation")
            && product.to_lowercase().contains("virtual machine")
        {
            evidence.push(format!(
                "registry SystemManufacturer/SystemProductName = \"{manufacturer}\" / \"{product}\""
            ));
            score += 25;
        }
    }

    if let Ok(services) = hklm.open_subkey(r"SYSTEM\CurrentControlSet\Services") {
        let hits: Vec<String> = services
            .enum_keys()
            .filter_map(|k| k.ok())
            .filter(|k| VM_SERVICE_NAMES.iter().any(|s| k.eq_ignore_ascii_case(s)))
            .collect();
        if !hits.is_empty() {
            evidence.push(format!("VM-specific services installed: {}", hits.join(", ")));
            score += 25;
        }
    }

    score.min(50)
}

#[cfg(target_os = "windows")]
fn check_filesystem_artifacts(evidence: &mut Vec<String>) -> u32 {
    let mut score = 0;
    for path in VM_ARTIFACT_PATHS {
        if std::path::Path::new(path).exists() {
            evidence.push(format!("found {path}"));
            score += 15;
        }
    }
    score.min(30)
}
