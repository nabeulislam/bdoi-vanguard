use crate::config::AgentConfig;
use crate::evidence::DetectionEvent;
use log::{error, info, warn};
use reqwest::Client;
use serde_json::json;
use std::sync::Arc;
use tokio::sync::mpsc;

pub struct Reporter {
    client: Client,
    config: Arc<AgentConfig>,
    rx: mpsc::Receiver<DetectionEvent>,
    session_id: Option<String>,
}

#[derive(Clone)]
pub struct ReporterHandle {
    tx: mpsc::Sender<DetectionEvent>,
}

impl ReporterHandle {
    pub async fn send(&self, event: DetectionEvent) {
        if let Err(e) = self.tx.send(event).await {
            error!("Failed to queue event: {}", e);
        }
    }
}

pub fn create_reporter(config: Arc<AgentConfig>) -> (Reporter, ReporterHandle) {
    let (tx, rx) = mpsc::channel(256);
    let reporter = Reporter {
        client: Client::new(),
        config,
        rx,
        session_id: None,
    };
    let handle = ReporterHandle { tx };
    (reporter, handle)
}

impl Reporter {
    pub async fn run(mut self) {
        info!("Reporter started — sending events to Supabase");

        // Register session on connect
        self.register_session().await;

        while let Some(event) = self.rx.recv().await {
            self.send_event(&event).await;

            if matches!(event.source, crate::evidence::MonitorSource::Heartbeat) {
                self.update_session_heartbeat().await;
            }
        }

        // Mark session as disconnected when channel closes
        self.disconnect_session().await;
    }

    async fn register_session(&mut self) {
        let os_info = format!("{} {}", std::env::consts::OS, std::env::consts::ARCH);
        let payload = json!({
            "contest_id": self.config.contest_id,
            "contestant_id": self.config.contestant_id,
            "contestant_name": self.config.contestant_name,
            "agent_version": env!("CARGO_PKG_VERSION"),
            "os_info": os_info,
            "started_at": chrono::Utc::now().to_rfc3339(),
            "last_heartbeat": chrono::Utc::now().to_rfc3339(),
            "is_active": true,
        });

        let url = self.config.api_endpoint("sessions");
        match self.client
            .post(&url)
            .header("apikey", &self.config.supabase_anon_key)
            .header("Authorization", format!("Bearer {}", self.config.access_token.as_deref().unwrap_or(&self.config.supabase_anon_key)))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .json(&payload)
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(body) = resp.json::<Vec<serde_json::Value>>().await {
                    if let Some(row) = body.first() {
                        self.session_id = row.get("id").and_then(|v| v.as_str()).map(String::from);
                        info!("Session registered: {:?}", self.session_id);
                    }
                }
            }
            Ok(resp) => warn!("Session register failed: {}", resp.status()),
            Err(e) => warn!("Session register error: {}", e),
        }
    }

    async fn update_session_heartbeat(&self) {
        let Some(ref sid) = self.session_id else { return };
        let url = format!("{}?id=eq.{}", self.config.api_endpoint("sessions"), sid);
        let _ = self.client
            .patch(&url)
            .header("apikey", &self.config.supabase_anon_key)
            .header("Authorization", format!("Bearer {}", self.config.access_token.as_deref().unwrap_or(&self.config.supabase_anon_key)))
            .header("Content-Type", "application/json")
            .json(&json!({ "last_heartbeat": chrono::Utc::now().to_rfc3339(), "is_active": true }))
            .send()
            .await;
    }

    async fn disconnect_session(&self) {
        let Some(ref sid) = self.session_id else { return };
        let url = format!("{}?id=eq.{}", self.config.api_endpoint("sessions"), sid);
        let _ = self.client
            .patch(&url)
            .header("apikey", &self.config.supabase_anon_key)
            .header("Authorization", format!("Bearer {}", self.config.access_token.as_deref().unwrap_or(&self.config.supabase_anon_key)))
            .header("Content-Type", "application/json")
            .json(&json!({ "is_active": false }))
            .send()
            .await;
        info!("Session disconnected: {}", sid);
    }

    async fn send_event(&self, event: &DetectionEvent) {
        let payload = json!({
            "event_id": event.id,
            "contest_id": self.config.contest_id,
            "contestant_id": self.config.contestant_id,
            "contestant_name": self.config.contestant_name,
            "timestamp": event.timestamp.to_rfc3339(),
            "source": event.source,
            "severity": event.severity,
            "confidence": event.confidence,
            "summary": event.summary,
            "details": event.details,
            "evidence_hash": event.evidence_hash,
        });

        let url = self.config.api_endpoint("violation_logs");

        match self
            .client
            .post(&url)
            .header("apikey", &self.config.supabase_anon_key)
            .header(
                "Authorization",
                format!(
                    "Bearer {}",
                    self.config.access_token.as_deref().unwrap_or(&self.config.supabase_anon_key)
                ),
            )
            .header("Content-Type", "application/json")
            .header("Prefer", "return=minimal")
            .json(&payload)
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                info!(
                    "[{}] Event sent: {} ({})",
                    event.source, event.summary, event.severity
                );
            }
            Ok(resp) => {
                error!(
                    "Supabase returned {}: {:?}",
                    resp.status(),
                    resp.text().await.unwrap_or_default()
                );
            }
            Err(e) => {
                error!("Failed to send event to Supabase: {}", e);
            }
        }

        self.log_locally(event);
    }

    fn log_locally(&self, event: &DetectionEvent) {
        let log_dir = &self.config.evidence_dir;
        if std::fs::create_dir_all(log_dir).is_ok() {
            let log_file = log_dir.join("events.jsonl");
            if let Ok(line) = serde_json::to_string(event) {
                use std::io::Write;
                if let Ok(mut f) = std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&log_file)
                {
                    let _ = writeln!(f, "{}", line);
                }
            }
        }
    }
}
