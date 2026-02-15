use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub supabase_url: String,
    pub supabase_anon_key: String,
    pub contest_id: String,
    pub contestant_id: String,
    pub contestant_name: String,
    /// Auth token from Supabase login
    pub access_token: Option<String>,
    /// How often monitors run their checks (seconds)
    pub scan_interval_secs: u64,
    /// How often heartbeats are sent (seconds)
    pub heartbeat_interval_secs: u64,
    /// Local evidence storage path
    pub evidence_dir: PathBuf,
}

impl AgentConfig {
    pub fn from_env() -> Self {
        let evidence_dir = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("bdoi-vanguard")
            .join("evidence");

        Self {
            supabase_url: std::env::var("BDOI_SUPABASE_URL")
                .unwrap_or_else(|_| "https://your-project.supabase.co".into()),
            supabase_anon_key: std::env::var("BDOI_SUPABASE_ANON_KEY")
                .unwrap_or_else(|_| "your-anon-key".into()),
            contest_id: std::env::var("BDOI_CONTEST_ID")
                .unwrap_or_else(|_| "default".into()),
            contestant_id: std::env::var("BDOI_CONTESTANT_ID")
                .unwrap_or_else(|_| "unknown".into()),
            contestant_name: std::env::var("BDOI_CONTESTANT_NAME")
                .unwrap_or_else(|_| "Unknown".into()),
            access_token: None,
            scan_interval_secs: 10,
            heartbeat_interval_secs: 30,
            evidence_dir,
        }
    }

    pub fn api_endpoint(&self, path: &str) -> String {
        format!("{}/rest/v1/{}", self.supabase_url, path)
    }
}
