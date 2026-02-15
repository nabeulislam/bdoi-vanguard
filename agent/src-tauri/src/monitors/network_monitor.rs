use crate::evidence::{DetectionEvent, MonitorSource, Severity};
use log::{info, warn};
use serde_json::json;
use std::process::Command;

/// Network Monitor
///
/// Monitors active network connections and DNS queries for known AI service
/// domains. Uses OS-level tools (netstat, ss, lsof) to check connections
/// without requiring raw packet capture (no elevated privileges needed).
pub struct NetworkMonitor {
    /// Known AI service domains
    ai_domains: Vec<AiDomain>,
}

struct AiDomain {
    name: &'static str,
    patterns: Vec<&'static str>,
    severity: Severity,
}

impl NetworkMonitor {
    pub fn new() -> Self {
        Self {
            ai_domains: vec![
                AiDomain {
                    name: "OpenAI / ChatGPT",
                    patterns: vec![
                        "openai.com", "chat.openai.com", "api.openai.com",
                        "chatgpt.com",
                    ],
                    severity: Severity::Flag,
                },
                AiDomain {
                    name: "Anthropic / Claude",
                    patterns: vec![
                        "anthropic.com", "claude.ai", "api.anthropic.com",
                    ],
                    severity: Severity::Flag,
                },
                AiDomain {
                    name: "Google Gemini",
                    patterns: vec![
                        "gemini.google.com", "generativelanguage.googleapis.com",
                        "bard.google.com",
                    ],
                    severity: Severity::Flag,
                },
                AiDomain {
                    name: "GitHub Copilot",
                    patterns: vec![
                        "copilot.github.com", "api.githubcopilot.com",
                        "copilot-proxy.githubusercontent.com",
                    ],
                    severity: Severity::Flag,
                },
                AiDomain {
                    name: "Perplexity",
                    patterns: vec!["perplexity.ai", "api.perplexity.ai"],
                    severity: Severity::Flag,
                },
                AiDomain {
                    name: "DeepSeek",
                    patterns: vec!["deepseek.com", "api.deepseek.com", "chat.deepseek.com"],
                    severity: Severity::Flag,
                },
                AiDomain {
                    name: "Phind",
                    patterns: vec!["phind.com", "api.phind.com"],
                    severity: Severity::Flag,
                },
                AiDomain {
                    name: "Codeium",
                    patterns: vec!["codeium.com", "api.codeium.com"],
                    severity: Severity::Flag,
                },
                AiDomain {
                    name: "Tabnine",
                    patterns: vec!["tabnine.com", "api.tabnine.com"],
                    severity: Severity::Flag,
                },
                AiDomain {
                    name: "HuggingFace",
                    patterns: vec!["huggingface.co", "api-inference.huggingface.co"],
                    severity: Severity::Warn,
                },
                AiDomain {
                    name: "Poe",
                    patterns: vec!["poe.com"],
                    severity: Severity::Flag,
                },
            ],
        }
    }

    /// Get active network connections with resolved hostnames
    fn get_active_connections(&self) -> Vec<String> {
        let mut connections = Vec::new();

        #[cfg(target_os = "linux")]
        {
            // Use ss (socket statistics) — faster than netstat
            if let Ok(output) = Command::new("ss")
                .args(["-tunap"])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    connections.push(line.to_lowercase());
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            if let Ok(output) = Command::new("lsof")
                .args(["-i", "-nP"])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    connections.push(line.to_lowercase());
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            if let Ok(output) = Command::new("netstat")
                .args(["-b", "-n"])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    connections.push(line.to_lowercase());
                }
            }
        }

        connections
    }

    /// Check recent DNS cache for AI domains
    fn check_dns_cache(&self) -> Vec<String> {
        let mut cached = Vec::new();

        #[cfg(target_os = "linux")]
        {
            // Check systemd-resolved DNS cache
            if let Ok(output) = Command::new("resolvectl")
                .args(["statistics"])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                cached.push(stdout.to_lowercase());
            }

            // Also check /etc/resolv.conf for any interesting entries
            if let Ok(content) = std::fs::read_to_string("/var/log/syslog") {
                // Look for recent DNS queries in syslog (if dnsmasq or systemd-resolved logs)
                for line in content.lines().rev().take(500) {
                    let lower = line.to_lowercase();
                    if lower.contains("query") || lower.contains("resolve") {
                        cached.push(lower);
                    }
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            if let Ok(output) = Command::new("ipconfig")
                .args(["/displaydns"])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    cached.push(line.to_lowercase());
                }
            }
        }

        cached
    }
}

impl super::Monitor for NetworkMonitor {
    fn name(&self) -> &str {
        "Network Monitor"
    }

    fn scan(&mut self) -> Vec<DetectionEvent> {
        let connections = self.get_active_connections();
        let dns_cache = self.check_dns_cache();
        let all_data: Vec<&str> = connections
            .iter()
            .chain(dns_cache.iter())
            .map(|s| s.as_str())
            .collect();

        let mut events = Vec::new();
        let mut flagged_services: Vec<String> = Vec::new();

        for domain in &self.ai_domains {
            for pattern in &domain.patterns {
                let found_in: Vec<&str> = all_data
                    .iter()
                    .filter(|line| line.contains(pattern))
                    .copied()
                    .collect();

                if !found_in.is_empty() && !flagged_services.contains(&domain.name.to_string()) {
                    flagged_services.push(domain.name.to_string());

                    warn!(
                        "Network Monitor: Connection to AI service '{}' detected (domain: {})",
                        domain.name, pattern
                    );

                    events.push(DetectionEvent::new(
                        MonitorSource::NetworkMonitor,
                        domain.severity,
                        0.90,
                        format!("Network connection to AI service: {}", domain.name),
                        json!({
                            "service": domain.name,
                            "matched_domain": pattern,
                            "connection_count": found_in.len(),
                        }),
                    ));
                }
            }
        }

        if events.is_empty() {
            info!("Network Monitor: No AI service connections detected");
        }

        events
    }
}
