use crate::evidence::{DetectionEvent, MonitorSource, Severity};
use log::info;
use serde_json::json;
use std::process::Command;

/// Focus Monitor
///
/// Tracks window focus changes and alt-tab patterns.
/// Purely informational — never generates standalone flags.
/// Supports other monitors as corroborating evidence.
pub struct FocusMonitor {
    /// Currently focused window title
    current_focus: Option<String>,
    /// Focus change log: (timestamp, window_title)
    focus_log: Vec<(std::time::Instant, String)>,
    /// Excessive alt-tab threshold (switches in 60 seconds)
    alttab_threshold: usize,
}

impl FocusMonitor {
    pub fn new() -> Self {
        Self {
            current_focus: None,
            focus_log: Vec::new(),
            alttab_threshold: 15,
        }
    }

    /// Get the currently focused window title
    fn get_focused_window(&self) -> Option<String> {
        #[cfg(target_os = "linux")]
        {
            if let Ok(output) = Command::new("xdotool")
                .args(["getactivewindow", "getwindowname"])
                .output()
            {
                if output.status.success() {
                    let title = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !title.is_empty() {
                        return Some(title);
                    }
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            let script = r#"
                tell application "System Events"
                    set frontApp to name of first application process whose frontmost is true
                    return frontApp
                end tell
            "#;
            if let Ok(output) = Command::new("osascript").args(["-e", script]).output() {
                if output.status.success() {
                    let title = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !title.is_empty() {
                        return Some(title);
                    }
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            let script = r#"
                Add-Type @"
                    using System;
                    using System.Runtime.InteropServices;
                    using System.Text;
                    public class WinAPI {
                        [DllImport("user32.dll")]
                        public static extern IntPtr GetForegroundWindow();
                        [DllImport("user32.dll")]
                        public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
                    }
"@
                $h = [WinAPI]::GetForegroundWindow()
                $sb = New-Object System.Text.StringBuilder 256
                [void][WinAPI]::GetWindowText($h, $sb, 256)
                $sb.ToString()
            "#;
            if let Ok(output) = Command::new("powershell")
                .args(["-NoProfile", "-Command", script])
                .output()
            {
                if output.status.success() {
                    let title = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !title.is_empty() {
                        return Some(title);
                    }
                }
            }
        }

        None
    }
}

impl super::Monitor for FocusMonitor {
    fn name(&self) -> &str {
        "Focus Monitor"
    }

    fn scan(&mut self) -> Vec<DetectionEvent> {
        let focused = match self.get_focused_window() {
            Some(t) => t,
            None => return vec![],
        };

        // Check if focus changed
        let changed = self
            .current_focus
            .as_ref()
            .map(|c| c != &focused)
            .unwrap_or(true);

        if !changed {
            return vec![];
        }

        self.current_focus = Some(focused.clone());
        self.focus_log
            .push((std::time::Instant::now(), focused.clone()));

        // Clean up old entries (keep last 60 seconds)
        let one_min_ago = std::time::Instant::now() - std::time::Duration::from_secs(60);
        self.focus_log.retain(|(t, _)| *t > one_min_ago);

        let switches_in_last_min = self.focus_log.len();

        if switches_in_last_min >= self.alttab_threshold {
            info!(
                "Focus Monitor: Excessive alt-tab — {} switches in last 60s",
                switches_in_last_min
            );

            let recent_titles: Vec<&str> = self
                .focus_log
                .iter()
                .rev()
                .take(10)
                .map(|(_, t)| t.as_str())
                .collect();

            return vec![DetectionEvent::new(
                MonitorSource::FocusMonitor,
                Severity::Watch, // informational only
                0.3,
                format!(
                    "Excessive window switching: {} switches in 60s",
                    switches_in_last_min
                ),
                json!({
                    "switches_in_last_minute": switches_in_last_min,
                    "recent_windows": recent_titles,
                    "current_focus": focused,
                }),
            )];
        }

        vec![]
    }
}
