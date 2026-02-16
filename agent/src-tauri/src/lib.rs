pub mod auth;
pub mod config;
pub mod evidence;
pub mod monitors;
pub mod reporter;

use auth::AuthSession;
use config::AgentConfig;
use evidence::{DetectionEvent, MonitorSource, Severity};
use monitors::Monitor;
use reporter::{create_reporter, ReporterHandle};
use serde_json::json;
use std::sync::{Arc, Mutex};
use log::info;

/// Shared application state accessible from Tauri commands
pub struct AppState {
    pub config: AgentConfig,
    pub session: Mutex<Option<AuthSession>>,
    pub monitoring: Mutex<bool>,
}

/// Orchestrates all monitors and the reporting pipeline
pub struct AntiCheatEngine {
    monitors: Vec<Box<dyn Monitor>>,
    reporter: ReporterHandle,
    start_time: std::time::Instant,
}

impl AntiCheatEngine {
    pub fn new(reporter: ReporterHandle) -> Self {
        #[allow(unused_mut)]
        let mut monitors: Vec<Box<dyn Monitor>> = vec![
            Box::new(monitors::vm_detect::VmDetector::new()),
            Box::new(monitors::process_monitor::ProcessMonitor::new()),
            Box::new(monitors::browser_monitor::BrowserMonitor::new()),
            Box::new(monitors::network_monitor::NetworkMonitor::new()),
            Box::new(monitors::clipboard_monitor::ClipboardMonitor::new()),
            Box::new(monitors::focus_monitor::FocusMonitor::new()),
        ];

        #[cfg(feature = "phone-detect")]
        monitors.push(Box::new(monitors::phone_detect::PhoneDetector::new()));

        Self {
            monitors,
            reporter,
            start_time: std::time::Instant::now(),
        }
    }

    pub async fn scan_cycle(&mut self) {
        for monitor in &mut self.monitors {
            let events = monitor.scan();
            for event in events {
                self.reporter.send(event).await;
            }
        }
    }

    pub async fn heartbeat(&self) {
        let event = DetectionEvent::new(
            MonitorSource::Heartbeat,
            Severity::Clean,
            1.0,
            "Agent heartbeat — monitoring active".into(),
            json!({
                "uptime_secs": self.start_time.elapsed().as_secs(),
                "monitors_active": self.monitors.len(),
            }),
        );
        self.reporter.send(event).await;
    }
}

// ── Tauri commands ──────────────────────────────────────────────────

#[tauri::command]
async fn login(
    contest_id: String,
    email: String,
    password: String,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<serde_json::Value, String> {
    let session = auth::login(
        &state.config.supabase_url,
        &state.config.supabase_anon_key,
        &email,
        &password,
    )
    .await?;

    let name = session.user.display_name();
    let user_id = session.user.id.clone();

    // Store session
    *state.session.lock().unwrap() = Some(session.clone());

    // Start monitoring in background
    let config = state.config.clone();
    let access_token = session.access_token.clone();
    let uid = user_id.clone();
    let uname = name.clone();

    let already_monitoring = {
        let m = state.monitoring.lock().unwrap();
        *m
    };

    if !already_monitoring {
        *state.monitoring.lock().unwrap() = true;
        let contest = contest_id.clone();

        std::thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
            rt.block_on(async move {
                let mut cfg = config.clone();
                cfg.contest_id = contest;
                cfg.contestant_id = uid;
                cfg.contestant_name = uname;
                cfg.access_token = Some(access_token);

                let (reporter, reporter_handle) = create_reporter(Arc::new(cfg.clone()));

                tokio::spawn(async move {
                    reporter.run().await;
                });

                let mut engine = AntiCheatEngine::new(reporter_handle);

                let scan_dur = std::time::Duration::from_secs(cfg.scan_interval_secs);
                let heartbeat_dur = std::time::Duration::from_secs(cfg.heartbeat_interval_secs);
                let mut last_heartbeat = std::time::Instant::now();

                info!("Monitoring started for {}", cfg.contestant_name);

                loop {
                    engine.scan_cycle().await;

                    if last_heartbeat.elapsed() >= heartbeat_dur {
                        engine.heartbeat().await;
                        last_heartbeat = std::time::Instant::now();
                    }

                    tokio::time::sleep(scan_dur).await;
                }
            });
        });
    }

    Ok(json!({
        "success": true,
        "name": name,
        "user_id": user_id,
    }))
}

#[tauri::command]
fn get_status(state: tauri::State<'_, Arc<AppState>>) -> serde_json::Value {
    let session = state.session.lock().unwrap();
    let monitoring = state.monitoring.lock().unwrap();

    match session.as_ref() {
        Some(s) => json!({
            "authenticated": true,
            "monitoring": *monitoring,
            "name": s.user.display_name(),
            "email": s.user.email,
            "user_id": s.user.id,
            "version": env!("CARGO_PKG_VERSION"),
        }),
        None => json!({
            "authenticated": false,
            "monitoring": false,
            "version": env!("CARGO_PKG_VERSION"),
        }),
    }
}

#[tauri::command]
fn get_config(state: tauri::State<'_, Arc<AppState>>) -> serde_json::Value {
    json!({
        "contest_id": state.config.contest_id,
        "scan_interval": state.config.scan_interval_secs,
        "supabase_url": state.config.supabase_url,
    })
}

// ── App entry ───────────────────────────────────────────────────────

pub fn run() {
    env_logger::init();
    info!("BDOI Vanguard Agent starting...");

    let config = AgentConfig::from_env();
    let app_state = Arc::new(AppState {
        config,
        session: Mutex::new(None),
        monitoring: Mutex::new(false),
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![login, get_status, get_config])
        .run(tauri::generate_context!())
        .expect("error while running BDOI Vanguard");
}
