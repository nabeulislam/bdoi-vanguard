use crate::config::AgentConfig;
use crate::evidence::DetectionEvent;
use log::{error, info, warn};
use reqwest::Client;
use serde_json::json;
use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::mpsc;

pub struct Reporter {
    client: Client,
    config: Arc<AgentConfig>,
    rx: mpsc::Receiver<DetectionEvent>,
    session_id: Option<String>,
    pending_path: PathBuf,
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
    let pending_path = config.evidence_dir.join("pending_upload.jsonl");
    let reporter = Reporter {
        client: Client::new(),
        config,
        rx,
        session_id: None,
        pending_path,
    };
    let handle = ReporterHandle { tx };
    (reporter, handle)
}

impl Reporter {
    pub async fn run(mut self) {
        info!("Reporter started — storing logs locally, uploading when online");

        // Register session on connect
        self.register_session().await;

        let mut flush_interval = tokio::time::interval(std::time::Duration::from_secs(60));
        flush_interval.tick().await; // consume first immediate tick

        loop {
            tokio::select! {
                Some(event) = self.rx.recv() => {
                    // Always persist locally first
                    self.log_locally(&event);
                    // Try to upload; on failure, queue for retry
                    if !self.try_upload_event(&event).await {
                        self.enqueue_pending(&event);
                    }

                    if matches!(event.source, crate::evidence::MonitorSource::Heartbeat) {
                        self.update_session_heartbeat().await;
                    }
                }
                _ = flush_interval.tick() => {
                    self.flush_pending().await;
                }
                else => break,
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

    /// Attempt to upload a single event. Returns true on success.
    async fn try_upload_event(&self, event: &DetectionEvent) -> bool {
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
                true
            }
            Ok(resp) => {
                warn!(
                    "Upload failed ({}), event queued for retry: {}",
                    resp.status(),
                    event.id
                );
                false
            }
            Err(e) => {
                warn!("Upload error ({}), event queued for retry: {}", e, event.id);
                false
            }
        }
    }

    /// Append an event to the pending-upload queue file.
    fn enqueue_pending(&self, event: &DetectionEvent) {
        if std::fs::create_dir_all(&self.config.evidence_dir).is_ok() {
            if let Ok(line) = serde_json::to_string(event) {
                if let Ok(mut f) = std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&self.pending_path)
                {
                    let _ = writeln!(f, "{}", line);
                }
            }
        }
    }

    /// Try to upload all pending events. Successfully uploaded ones are removed from the queue.
    async fn flush_pending(&self) {
        let events: Vec<DetectionEvent> = match std::fs::File::open(&self.pending_path) {
            Ok(f) => std::io::BufReader::new(f)
                .lines()
                .filter_map(|l| l.ok())
                .filter_map(|l| serde_json::from_str(&l).ok())
                .collect(),
            Err(_) => return,
        };

        if events.is_empty() {
            return;
        }

        info!("Flushing {} pending events...", events.len());

        let mut still_pending: Vec<String> = Vec::new();
        for event in &events {
            if !self.try_upload_event(event).await {
                if let Ok(line) = serde_json::to_string(event) {
                    still_pending.push(line);
                }
            }
        }

        // Rewrite the pending file with only the events that still failed
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .write(true)
            .truncate(true)
            .create(true)
            .open(&self.pending_path)
        {
            for line in &still_pending {
                let _ = writeln!(f, "{}", line);
            }
        }

        if still_pending.is_empty() {
            info!("All pending events uploaded successfully");
        } else {
            warn!("{} events still pending upload", still_pending.len());
        }
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
