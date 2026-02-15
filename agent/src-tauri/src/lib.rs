pub mod config;
pub mod evidence;
pub mod monitors;
pub mod reporter;

use config::AgentConfig;
use evidence::{DetectionEvent, MonitorSource, Severity};
use monitors::Monitor;
use reporter::{create_reporter, ReporterHandle};
use serde_json::json;
use std::sync::Arc;
use log::info;

/// Orchestrates all monitors and the reporting pipeline
pub struct AntiCheatEngine {
    config: Arc<AgentConfig>,
    monitors: Vec<Box<dyn Monitor>>,
    reporter: ReporterHandle,
}

impl AntiCheatEngine {
    pub fn new(config: AgentConfig, reporter: ReporterHandle) -> Self {
        let config = Arc::new(config);

        let monitors: Vec<Box<dyn Monitor>> = vec![
            Box::new(monitors::vm_detect::VmDetector::new()),
            Box::new(monitors::process_monitor::ProcessMonitor::new()),
            Box::new(monitors::browser_monitor::BrowserMonitor::new()),
            Box::new(monitors::network_monitor::NetworkMonitor::new()),
            Box::new(monitors::clipboard_monitor::ClipboardMonitor::new()),
            Box::new(monitors::focus_monitor::FocusMonitor::new()),
            Box::new(monitors::phone_detect::PhoneDetector::new()),
        ];

        Self {
            config,
            monitors,
            reporter,
        }
    }

    /// Run a single scan cycle across all monitors
    pub async fn scan_cycle(&mut self) {
        for monitor in &mut self.monitors {
            let events = monitor.scan();
            for event in events {
                self.reporter.send(event).await;
            }
        }
    }

    /// Send a heartbeat to prove the agent is still running
    pub async fn heartbeat(&self) {
        let event = DetectionEvent::new(
            MonitorSource::Heartbeat,
            Severity::Clean,
            1.0,
            "Agent heartbeat — monitoring active".into(),
            json!({
                "uptime_secs": 0, // TODO: track actual uptime
                "monitors_active": self.monitors.len(),
            }),
        );
        self.reporter.send(event).await;
    }
}

// Tauri commands exposed to the frontend

#[tauri::command]
fn get_status() -> serde_json::Value {
    json!({
        "status": "monitoring",
        "version": env!("CARGO_PKG_VERSION"),
    })
}

#[tauri::command]
fn get_config() -> serde_json::Value {
    let config = AgentConfig::from_env();
    json!({
        "contest_id": config.contest_id,
        "contestant_id": config.contestant_id,
        "contestant_name": config.contestant_name,
        "scan_interval": config.scan_interval_secs,
    })
}

/// Build and run the Tauri application with the anti-cheat engine
pub fn run() {
    env_logger::init();
    info!("BDOI Vanguard Agent starting...");

    let config = AgentConfig::from_env();
    let scan_interval = config.scan_interval_secs;
    let heartbeat_interval = config.heartbeat_interval_secs;

    let (reporter, reporter_handle) = create_reporter(Arc::new(config.clone()));

    // Spawn the reporter task
    let reporter_handle_clone = reporter_handle.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![get_status, get_config])
        .setup(move |_app| {
            // Start the reporter in the background
            let rt = tokio::runtime::Handle::current();

            rt.spawn(async move {
                reporter.run().await;
            });

            // Start the scan loop
            let handle = reporter_handle_clone;
            rt.spawn(async move {
                let mut engine = AntiCheatEngine::new(
                    AgentConfig::from_env(),
                    handle,
                );

                let scan_dur = std::time::Duration::from_secs(scan_interval);
                let heartbeat_dur = std::time::Duration::from_secs(heartbeat_interval);
                let mut last_heartbeat = std::time::Instant::now();

                info!("Anti-cheat engine started — scanning every {}s", scan_interval);

                loop {
                    engine.scan_cycle().await;

                    if last_heartbeat.elapsed() >= heartbeat_dur {
                        engine.heartbeat().await;
                        last_heartbeat = std::time::Instant::now();
                    }

                    tokio::time::sleep(scan_dur).await;
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running BDOI Vanguard");
}
