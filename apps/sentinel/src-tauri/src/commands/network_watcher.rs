use serde::Serialize;
use std::collections::HashMap;
use sysinfo::System;
use windows::Win32::NetworkManagement::IpHelper::{
    GetExtendedTcpTable, MIB_TCPROW_OWNER_PID, MIB_TCPTABLE_OWNER_PID, TCP_TABLE_OWNER_PID_ALL,
};

const AF_INET: u32 = 2;
// TCP connection is actively established (as opposed to LISTEN, TIME_WAIT,
// CLOSE_WAIT, etc.) — the only state worth surfacing for anomaly review;
// listening sockets are this app/OS services waiting for inbound
// connections, not this machine reaching out anywhere.
const MIB_TCP_STATE_ESTAB: u32 = 5;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NetworkConnection {
    pub pid: u32,
    pub process_name: String,
    pub remote_ip: String,
    pub remote_port: u16,
}

/// Enumerates established outbound TCP connections and resolves each to its
/// owning process. This is the spec's "Active Connection Monitoring" —
/// deliberately NOT paired with a hardcoded allowlist/blocklist of known-
/// good or known-bad destinations here: IP-based blocking is fragile (CDN
/// IPs are shared across completely unrelated services, they rotate, and a
/// hardcoded list of "AI service IPs" would be stale within weeks). The
/// spec's own allowlist (CodeForge API, S3 endpoint, DNS, Judge0) only
/// exists once a real deployment's config is known — that's Phase 10's job.
/// `flag_unexpected_connections` below takes that allowlist as an argument
/// rather than baking in a guess.
#[tauri::command]
pub fn get_active_connections() -> Result<Vec<NetworkConnection>, String> {
    let rows = read_tcp_table()?;

    let mut sys = System::new_all();
    sys.refresh_all();
    let mut pid_names: HashMap<u32, String> = HashMap::new();
    for (pid, process) in sys.processes() {
        pid_names.insert(pid.as_u32(), process.name().to_string_lossy().to_string());
    }

    Ok(rows
        .into_iter()
        .filter(|r| r.dwState == MIB_TCP_STATE_ESTAB)
        .map(|r| NetworkConnection {
            pid: r.dwOwningPid,
            process_name: pid_names
                .get(&r.dwOwningPid)
                .cloned()
                .unwrap_or_else(|| "unknown".to_string()),
            remote_ip: ipv4_to_string(r.dwRemoteAddr),
            remote_port: u16::from_be((r.dwRemotePort & 0xFFFF) as u16),
        })
        .collect())
}

/// Cross-references the current connection list against a caller-supplied
/// allowlist of hostnames/IP substrings (matched loosely — see the doc
/// comment above on why this isn't a hardcoded list). Returns connections
/// that don't match anything in it.
#[tauri::command]
pub fn flag_unexpected_connections(allowlist: Vec<String>) -> Result<Vec<NetworkConnection>, String> {
    let connections = get_active_connections()?;
    let allowlist_lower: Vec<String> = allowlist.iter().map(|s| s.to_lowercase()).collect();
    Ok(connections
        .into_iter()
        .filter(|c| {
            !allowlist_lower
                .iter()
                .any(|a| c.remote_ip.contains(a.as_str()) || c.process_name.to_lowercase().contains(a.as_str()))
        })
        .collect())
}

fn ipv4_to_string(addr_be: u32) -> String {
    // dwRemoteAddr/dwLocalAddr are stored in network byte order already (the
    // MIB_TCPROW_OWNER_PID docs specify this), so read out the raw bytes
    // directly rather than applying another endianness conversion on top.
    let bytes = addr_be.to_ne_bytes();
    format!("{}.{}.{}.{}", bytes[0], bytes[1], bytes[2], bytes[3])
}

/// GetExtendedTcpTable's classic two-call pattern: call once with a null
/// buffer to learn the required size, allocate exactly that, call again.
/// The returned MIB_TCPTABLE_OWNER_PID is a C variable-length struct
/// (`table: [MIB_TCPROW_OWNER_PID; 1]` but dwNumEntries rows actually
/// follow in memory) — read via raw pointer arithmetic, there's no safe way
/// to express this shape in Rust's type system.
///
/// The backing buffer is `Vec<u32>`, not `Vec<u8>`: every field in both
/// structs is a u32, so the table needs 4-byte alignment, and `Vec<u8>`'s
/// allocation is only guaranteed 1-byte aligned per Rust's rules (real
/// allocators happen to return well-aligned pointers anyway, which is why
/// this never actually crashed on x86_64 — Vec<u32> makes the alignment an
/// actual guarantee instead of an accident of the allocator).
fn read_tcp_table() -> Result<Vec<MIB_TCPROW_OWNER_PID>, String> {
    let mut size: u32 = 0;
    unsafe {
        GetExtendedTcpTable(None, &mut size, false, AF_INET, TCP_TABLE_OWNER_PID_ALL, 0);
    }
    if size == 0 {
        return Ok(Vec::new());
    }

    let mut buffer = vec![0u32; size.div_ceil(4) as usize];
    let result = unsafe {
        GetExtendedTcpTable(
            Some(buffer.as_mut_ptr() as *mut core::ffi::c_void),
            &mut size,
            false,
            AF_INET,
            TCP_TABLE_OWNER_PID_ALL,
            0,
        )
    };
    if result != 0 {
        return Err(format!("GetExtendedTcpTable failed with error code {result}"));
    }

    let table = buffer.as_ptr() as *const MIB_TCPTABLE_OWNER_PID;
    let num_entries = unsafe { (*table).dwNumEntries } as usize;
    let rows_ptr = unsafe { core::ptr::addr_of!((*table).table) as *const MIB_TCPROW_OWNER_PID };
    let rows = unsafe { core::slice::from_raw_parts(rows_ptr, num_entries) };
    Ok(rows.to_vec())
}
