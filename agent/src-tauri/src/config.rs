use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub supabase_url: String,
    pub supabase_anon_key: String,
    pub contest_id: String,
    pub contestant_id: String,
    pub contestant_name: String,
    pub access_token: Option<String>,
    pub scan_interval_secs: u64,
    pub heartbeat_interval_secs: u64,
    pub evidence_dir: PathBuf,
}

impl AgentConfig {
    pub fn from_env() -> Self {
        let evidence_dir = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("bdoi-vanguard")
            .join("evidence");

        // Compile-time env vars (baked into binary) with runtime fallback
        let supabase_url = option_env!("BDOI_SUPABASE_URL")
            .map(String::from)
            .or_else(|| std::env::var("BDOI_SUPABASE_URL").ok())
            .unwrap_or_else(|| "https://your-project.supabase.co".into());

        let supabase_anon_key = option_env!("BDOI_SUPABASE_ANON_KEY")
            .map(String::from)
            .or_else(|| std::env::var("BDOI_SUPABASE_ANON_KEY").ok())
            .unwrap_or_else(|| "your-anon-key".into());

        Self {
            supabase_url,
            supabase_anon_key,
            contest_id: String::new(),
            contestant_id: String::new(),
            contestant_name: String::new(),
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
