pub mod vm_detect;
pub mod process_monitor;
pub mod browser_monitor;
pub mod network_monitor;
pub mod clipboard_monitor;
pub mod focus_monitor;
#[cfg(feature = "phone-detect")]
pub mod phone_detect;

use crate::evidence::DetectionEvent;

/// Trait all monitors implement
pub trait Monitor: Send + Sync {
    /// Human-readable name
    fn name(&self) -> &str;

    /// Run a single scan cycle and return any detection events
    fn scan(&mut self) -> Vec<DetectionEvent>;
}
