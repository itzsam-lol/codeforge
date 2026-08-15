use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub exe_path: Option<String>,
    pub parent_pid: Option<u32>,
    pub cpu_usage: f32,
    pub memory_kb: u64,
    /// Unix seconds.
    pub start_time: u64,
}
