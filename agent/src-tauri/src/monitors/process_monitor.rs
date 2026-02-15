use crate::evidence::{DetectionEvent, MonitorSource, Severity};
use log::{info, warn};
use serde_json::json;
use sysinfo::{ProcessRefreshKind, RefreshKind, System};

/// Process Monitor
///
/// Scans running processes for known AI tools, memory editors, and
/// suspicious debugging/screen-sharing software.
pub struct ProcessMonitor {
    system: System,
}

/// Categories of suspicious processes
struct ProcessRule {
    keywords: Vec<&'static str>,
    category: &'static str,
    severity: Severity,
}

impl ProcessMonitor {
    pub fn new() -> Self {
        Self {
            system: System::new_with_specifics(
                RefreshKind::nothing()
                    .with_processes(ProcessRefreshKind::everything()),
            ),
        }
    }

    fn get_rules() -> Vec<ProcessRule> {
        vec![
            // AI coding assistants
            ProcessRule {
                keywords: vec![
                    "copilot", "codeium", "tabnine", "cursor",
                    "cody", "sourcegraph", "continue.dev",
                    "aider", "codegpt",
                ],
                category: "ai_coding_tool",
                severity: Severity::Flag,
            },
            // AI chat applications
            ProcessRule {
                keywords: vec![
                    "chatgpt", "claude", "openai",
                ],
                category: "ai_chat_app",
                severity: Severity::Flag,
            },
            // Memory editors & debuggers (cheating tools)
            ProcessRule {
                keywords: vec![
                    "cheatengine", "cheat engine",
                    "x64dbg", "x32dbg", "ollydbg",
                    "process hacker", "processhacker",
                    "ida64", "ida32", "idapro",
                ],
                category: "memory_editor",
                severity: Severity::Flag,
            },
            // Screen sharing (potential leak of problems)
            ProcessRule {
                keywords: vec![
                    "anydesk", "teamviewer", "rustdesk",
                    "parsec", "screenconnect",
                ],
                category: "screen_sharing",
                severity: Severity::Warn,
            },
        ]
    }
}

impl super::Monitor for ProcessMonitor {
    fn name(&self) -> &str {
        "Process Monitor"
    }

    fn scan(&mut self) -> Vec<DetectionEvent> {
        self.system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

        let rules = Self::get_rules();
        let mut events = Vec::new();
        let mut already_flagged: Vec<String> = Vec::new();

        for (_pid, process) in self.system.processes() {
            let name = process.name().to_string_lossy().to_lowercase();
            let exe_path = process
                .exe()
                .map(|p| p.to_string_lossy().to_lowercase())
                .unwrap_or_default();

            let cmd: Vec<String> = process.cmd().iter().map(|s| s.to_string_lossy().to_lowercase().to_string()).collect();
            let cmd_str = cmd.join(" ");

            for rule in &rules {
                for keyword in &rule.keywords {
                    let matched = name.contains(keyword)
                        || exe_path.contains(keyword)
                        || cmd_str.contains(keyword);

                    if matched {
                        let key = format!("{}:{}", rule.category, keyword);
                        if already_flagged.contains(&key) {
                            continue;
                        }
                        already_flagged.push(key);

                        warn!(
                            "Process Monitor: Detected {} — process '{}' (pid {}) matches '{}'",
                            rule.category,
                            name,
                            _pid.as_u32(),
                            keyword
                        );

                        events.push(DetectionEvent::new(
                            MonitorSource::ProcessMonitor,
                            rule.severity,
                            0.95,
                            format!(
                                "Suspicious process detected: {} (category: {})",
                                name, rule.category
                            ),
                            json!({
                                "process_name": name,
                                "pid": _pid.as_u32(),
                                "exe_path": exe_path,
                                "matched_keyword": keyword,
                                "category": rule.category,
                            }),
                        ));
                    }
                }
            }
        }

        if events.is_empty() {
            info!("Process Monitor: No suspicious processes found");
        }

        events
    }
}
