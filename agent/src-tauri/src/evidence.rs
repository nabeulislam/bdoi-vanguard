use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt;

/// Severity levels for the confidence/fairness system
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Severity {
    Clean,
    Watch,
    Warn,
    Flag,
}

impl fmt::Display for Severity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Severity::Clean => write!(f, "CLEAN"),
            Severity::Watch => write!(f, "WATCH"),
            Severity::Warn => write!(f, "WARN"),
            Severity::Flag => write!(f, "FLAG"),
        }
    }
}

/// Which monitor generated this event
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MonitorSource {
    VmDetect,
    ProcessMonitor,
    BrowserMonitor,
    NetworkMonitor,
    ClipboardMonitor,
    FocusMonitor,
    PhoneDetect,
    Heartbeat,
}

impl fmt::Display for MonitorSource {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MonitorSource::VmDetect => write!(f, "vm_detect"),
            MonitorSource::ProcessMonitor => write!(f, "process_monitor"),
            MonitorSource::BrowserMonitor => write!(f, "browser_monitor"),
            MonitorSource::NetworkMonitor => write!(f, "network_monitor"),
            MonitorSource::ClipboardMonitor => write!(f, "clipboard_monitor"),
            MonitorSource::FocusMonitor => write!(f, "focus_monitor"),
            MonitorSource::PhoneDetect => write!(f, "phone_detect"),
            MonitorSource::Heartbeat => write!(f, "heartbeat"),
        }
    }
}

/// A single detection event with full evidence chain
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectionEvent {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub source: MonitorSource,
    pub severity: Severity,
    pub confidence: f64,
    pub summary: String,
    pub details: serde_json::Value,
    pub evidence_hash: String,
}

impl DetectionEvent {
    pub fn new(
        source: MonitorSource,
        severity: Severity,
        confidence: f64,
        summary: String,
        details: serde_json::Value,
    ) -> Self {
        let id = uuid::Uuid::new_v4().to_string();
        let timestamp = Utc::now();

        // Create a tamper-proof hash of the evidence
        let evidence_hash = Self::hash_evidence(&id, &timestamp, &source, &details);

        Self {
            id,
            timestamp,
            source,
            severity,
            confidence,
            summary,
            details,
            evidence_hash,
        }
    }

    fn hash_evidence(
        id: &str,
        timestamp: &DateTime<Utc>,
        source: &MonitorSource,
        details: &serde_json::Value,
    ) -> String {
        let mut hasher = Sha256::new();
        hasher.update(id.as_bytes());
        hasher.update(timestamp.to_rfc3339().as_bytes());
        hasher.update(source.to_string().as_bytes());
        hasher.update(details.to_string().as_bytes());
        hex::encode(hasher.finalize())
    }
}

/// Hash content for privacy (e.g., clipboard)
pub fn hash_content(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    hex::encode(hasher.finalize())
}
