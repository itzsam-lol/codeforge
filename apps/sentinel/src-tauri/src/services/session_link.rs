use crate::services::heartbeat::{self, HeartbeatState};
use crate::services::watchdog::WatchdogState;
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use url::Url;

const EVENT: &str = "sentinel://session";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionLinkPayload {
    connected: bool,
    api_base_url: Option<String>,
    /// Never the full token — heartbeat.rs already treats it as a bearer
    /// credential, so only enough of it is echoed back to the UI to
    /// confirm "yes, a link came through" without displaying a value a
    /// screen-share could leak.
    token_preview: Option<String>,
    error: Option<String>,
}

fn mask(token: &str) -> String {
    let head: String = token.chars().take(6).collect();
    format!("{head}…")
}

/// Parses `codeforge-sentinel://start?apiUrl=...&token=...` (the link
/// apps/web's candidate page opens when CodeForge Sentinel is required —
/// see apps/web/src/app/t/[token]/page.tsx's SentinelGate) and, if valid,
/// starts the heartbeat loop the same way a manual connect would. Emits
/// `sentinel://session` either way so the frontend never has to parse the
/// URL itself or guess whether a link attempt succeeded.
pub fn handle(
    app: &AppHandle,
    heartbeat_state: &Arc<HeartbeatState>,
    watchdog_state: &Arc<WatchdogState>,
    url: Url,
) {
    if url.scheme() != "codeforge-sentinel" {
        return;
    }

    let mut api_base_url: Option<String> = None;
    let mut token: Option<String> = None;
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "apiUrl" => api_base_url = Some(value.into_owned()),
            "token" => token = Some(value.into_owned()),
            _ => {}
        }
    }

    let payload = match (api_base_url, token) {
        (Some(api_base_url), Some(token)) if token.len() >= 32 => {
            heartbeat::spawn(heartbeat_state.clone(), watchdog_state.clone(), api_base_url.clone(), token.clone());
            SessionLinkPayload {
                connected: true,
                api_base_url: Some(api_base_url),
                token_preview: Some(mask(&token)),
                error: None,
            }
        }
        _ => SessionLinkPayload {
            connected: false,
            api_base_url: None,
            token_preview: None,
            error: Some("The link from CodeForge was missing its session details.".into()),
        },
    };

    let _ = app.emit(EVENT, payload);
}
