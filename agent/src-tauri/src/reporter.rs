use crate::config::AgentConfig;
use crate::evidence::DetectionEvent;
use log::{error, info};
use reqwest::Client;
use serde_json::json;
use std::sync::Arc;
use tokio::sync::mpsc;

/// Sends detection events to Supabase
pub struct Reporter {
    client: Client,
    config: Arc<AgentConfig>,
    rx: mpsc::Receiver<DetectionEvent>,
}

/// Handle for monitors to send events
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
    };
    let handle = ReporterHandle { tx };
    (reporter, handle)
}

impl Reporter {
    pub async fn run(mut self) {
        info!("Reporter started — sending events to Supabase");

        while let Some(event) = self.rx.recv().await {
            self.send_event(&event).await;
        }
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
                format!("Bearer {}", self.config.supabase_anon_key),
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
                // TODO: queue for retry
            }
        }

        // Also log locally
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
