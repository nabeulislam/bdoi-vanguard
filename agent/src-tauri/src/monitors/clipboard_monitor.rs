use crate::evidence::{hash_content, DetectionEvent, MonitorSource, Severity};
use log::info;
use serde_json::json;
use std::process::Command;

/// Clipboard Monitor
///
/// Monitors clipboard for suspicious paste patterns that indicate AI usage.
/// Privacy-first: only stores content hashes, never raw clipboard content.
/// This is a supplementary signal — never a standalone flag.
pub struct ClipboardMonitor {
    /// Hash of last seen clipboard content (to detect changes)
    last_hash: Option<String>,
    /// Size of last clipboard content
    last_size: usize,
    /// Track rapid paste events (timestamps of recent large pastes)
    recent_large_pastes: Vec<std::time::Instant>,
    /// Minimum characters to consider a "large" paste
    large_paste_threshold: usize,
}

impl ClipboardMonitor {
    pub fn new() -> Self {
        Self {
            last_hash: None,
            last_size: 0,
            recent_large_pastes: Vec::new(),
            large_paste_threshold: 200,
        }
    }

    /// Get current clipboard text content
    fn get_clipboard_text(&self) -> Option<String> {
        #[cfg(target_os = "linux")]
        {
            if let Ok(output) = Command::new("xclip")
                .args(["-selection", "clipboard", "-o"])
                .output()
            {
                if output.status.success() {
                    return Some(String::from_utf8_lossy(&output.stdout).to_string());
                }
            }
            // Fallback to xsel
            if let Ok(output) = Command::new("xsel")
                .args(["--clipboard", "--output"])
                .output()
            {
                if output.status.success() {
                    return Some(String::from_utf8_lossy(&output.stdout).to_string());
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            if let Ok(output) = Command::new("pbpaste").output() {
                if output.status.success() {
                    return Some(String::from_utf8_lossy(&output.stdout).to_string());
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            let script = r#"Get-Clipboard"#;
            if let Ok(output) = Command::new("powershell")
                .args(["-NoProfile", "-Command", script])
                .output()
            {
                if output.status.success() {
                    return Some(String::from_utf8_lossy(&output.stdout).to_string());
                }
            }
        }

        None
    }
}

impl super::Monitor for ClipboardMonitor {
    fn name(&self) -> &str {
        "Clipboard Monitor"
    }

    fn scan(&mut self) -> Vec<DetectionEvent> {
        let content = match self.get_clipboard_text() {
            Some(c) => c,
            None => return vec![],
        };

        let content_hash = hash_content(&content);
        let content_size = content.len();

        // Check if clipboard has changed
        if self.last_hash.as_ref() == Some(&content_hash) {
            return vec![];
        }

        self.last_hash = Some(content_hash.clone());
        self.last_size = content_size;

        // Clean up old timestamps (keep last 5 minutes)
        let five_min_ago = std::time::Instant::now() - std::time::Duration::from_secs(300);
        self.recent_large_pastes.retain(|t| *t > five_min_ago);

        // Only flag large pastes
        if content_size < self.large_paste_threshold {
            return vec![];
        }

        self.recent_large_pastes.push(std::time::Instant::now());

        let mut events = Vec::new();

        // Rapid large paste pattern: 3+ large pastes in 5 minutes
        if self.recent_large_pastes.len() >= 3 {
            info!(
                "Clipboard Monitor: Rapid large paste pattern — {} large pastes in 5 min",
                self.recent_large_pastes.len()
            );

            events.push(DetectionEvent::new(
                MonitorSource::ClipboardMonitor,
                Severity::Watch, // supplementary only, never standalone
                0.5,
                format!(
                    "Rapid large paste pattern: {} pastes of >{}chars in 5 min",
                    self.recent_large_pastes.len(),
                    self.large_paste_threshold
                ),
                json!({
                    "content_hash": content_hash,
                    "content_size": content_size,
                    "recent_large_paste_count": self.recent_large_pastes.len(),
                    "note": "Content hash stored for integrity — raw content never transmitted"
                }),
            ));
        } else {
            // Single large paste — informational only
            info!(
                "Clipboard Monitor: Large clipboard change detected ({} chars)",
                content_size
            );
        }

        events
    }
}
