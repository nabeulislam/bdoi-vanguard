use crate::evidence::{DetectionEvent, MonitorSource, Severity};
use log::{info, warn};
use serde_json::json;
use std::process::Command;

/// Browser / Window Title Monitor
///
/// Monitors visible window titles for AI service indicators.
/// Uses OS-level accessibility/window APIs to read titles without
/// injecting into browser processes.
pub struct BrowserMonitor {
    /// AI service patterns to detect in window titles
    ai_patterns: Vec<AiPattern>,
}

struct AiPattern {
    name: &'static str,
    keywords: Vec<&'static str>,
    severity: Severity,
}

impl BrowserMonitor {
    pub fn new() -> Self {
        Self {
            ai_patterns: vec![
                AiPattern {
                    name: "ChatGPT",
                    keywords: vec!["chatgpt", "chat.openai.com"],
                    severity: Severity::Flag,
                },
                AiPattern {
                    name: "Claude",
                    keywords: vec!["claude.ai", "claude - "],
                    severity: Severity::Flag,
                },
                AiPattern {
                    name: "Google Gemini",
                    keywords: vec!["gemini.google", "google gemini", "bard.google"],
                    severity: Severity::Flag,
                },
                AiPattern {
                    name: "GitHub Copilot Chat",
                    keywords: vec!["copilot", "github copilot"],
                    severity: Severity::Flag,
                },
                AiPattern {
                    name: "Perplexity",
                    keywords: vec!["perplexity.ai", "perplexity -"],
                    severity: Severity::Flag,
                },
                AiPattern {
                    name: "Phind",
                    keywords: vec!["phind.com", "phind -"],
                    severity: Severity::Flag,
                },
                AiPattern {
                    name: "DeepSeek",
                    keywords: vec!["deepseek", "chat.deepseek"],
                    severity: Severity::Flag,
                },
                AiPattern {
                    name: "Poe",
                    keywords: vec!["poe.com", "poe - "],
                    severity: Severity::Flag,
                },
                AiPattern {
                    name: "HuggingChat",
                    keywords: vec!["huggingchat", "huggingface.co/chat"],
                    severity: Severity::Flag,
                },
                AiPattern {
                    name: "You.com",
                    keywords: vec!["you.com"],
                    severity: Severity::Warn,
                },
            ],
        }
    }

    /// Get all visible window titles from the OS
    fn get_window_titles(&self) -> Vec<String> {
        let mut titles = Vec::new();

        #[cfg(target_os = "linux")]
        {
            // Use wmctrl or xdotool to get window titles
            if let Ok(output) = Command::new("wmctrl").arg("-l").output() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    // wmctrl format: <window_id> <desktop> <machine> <title...>
                    let parts: Vec<&str> = line.splitn(4, char::is_whitespace).collect();
                    if parts.len() >= 4 {
                        titles.push(parts[3].to_string());
                    }
                }
            } else if let Ok(output) = Command::new("xdotool")
                .args(["search", "--name", ""])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for window_id in stdout.lines() {
                    if let Ok(name_output) = Command::new("xdotool")
                        .args(["getwindowname", window_id])
                        .output()
                    {
                        let title = String::from_utf8_lossy(&name_output.stdout)
                            .trim()
                            .to_string();
                        if !title.is_empty() {
                            titles.push(title);
                        }
                    }
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            let script = r#"
                tell application "System Events"
                    set windowList to {}
                    repeat with proc in (every process whose background only is false)
                        try
                            repeat with w in (every window of proc)
                                set end of windowList to (name of w as text)
                            end repeat
                        end try
                    end repeat
                    return windowList
                end tell
            "#;
            if let Ok(output) = Command::new("osascript").args(["-e", script]).output() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for title in stdout.split(", ") {
                    let t = title.trim().to_string();
                    if !t.is_empty() {
                        titles.push(t);
                    }
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            // Use PowerShell to enumerate windows
            let script = r#"Get-Process | Where-Object {$_.MainWindowTitle -ne ""} | Select-Object -ExpandProperty MainWindowTitle"#;
            if let Ok(output) = Command::new("powershell")
                .args(["-NoProfile", "-Command", script])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for title in stdout.lines() {
                    let t = title.trim().to_string();
                    if !t.is_empty() {
                        titles.push(t);
                    }
                }
            }
        }

        titles
    }
}

impl super::Monitor for BrowserMonitor {
    fn name(&self) -> &str {
        "Browser Monitor"
    }

    fn scan(&mut self) -> Vec<DetectionEvent> {
        let titles = self.get_window_titles();
        let mut events = Vec::new();

        for title in &titles {
            let title_lower = title.to_lowercase();

            for pattern in &self.ai_patterns {
                for keyword in &pattern.keywords {
                    if title_lower.contains(keyword) {
                        warn!(
                            "Browser Monitor: AI service '{}' detected in window title: '{}'",
                            pattern.name, title
                        );

                        events.push(DetectionEvent::new(
                            MonitorSource::BrowserMonitor,
                            pattern.severity,
                            0.95,
                            format!(
                                "AI service '{}' detected in browser tab",
                                pattern.name
                            ),
                            json!({
                                "window_title": title,
                                "matched_service": pattern.name,
                                "matched_keyword": keyword,
                            }),
                        ));
                        break; // Don't double-flag same title for same service
                    }
                }
            }
        }

        if events.is_empty() {
            info!("Browser Monitor: No AI tabs detected");
        }

        events
    }
}
