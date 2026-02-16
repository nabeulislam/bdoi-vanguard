use crate::evidence::{DetectionEvent, MonitorSource, Severity};
use log::{info, warn};
use serde_json::json;
use std::fs;
use std::process::Command;

/// VM Detection Monitor
///
/// Checks multiple independent signals to determine if running inside a VM.
/// Designed for zero false positives: needs 2+ signals to FLAG.
pub struct VmDetector {
    has_run_initial: bool,
}

impl VmDetector {
    pub fn new() -> Self {
        Self {
            has_run_initial: false,
        }
    }
}

impl super::Monitor for VmDetector {
    fn name(&self) -> &str {
        "VM Detector"
    }

    fn scan(&mut self) -> Vec<DetectionEvent> {
        // VM detection only needs to run once at startup
        if self.has_run_initial {
            return vec![];
        }
        self.has_run_initial = true;

        let mut signals: Vec<String> = Vec::new();

        // Check 1: CPUID hypervisor bit (cross-platform via /proc/cpuinfo on Linux)
        if let Some(s) = check_cpuid_hypervisor() {
            signals.push(s);
        }

        // Check 2: DMI/SMBIOS strings
        if let Some(s) = check_dmi_strings() {
            signals.push(s);
        }

        // Check 3: Known VM processes/services
        if let Some(s) = check_vm_processes() {
            signals.push(s);
        }

        // Check 4: MAC address OUI
        if let Some(s) = check_mac_address() {
            signals.push(s);
        }

        // Check 5: Hypervisor-specific files/devices
        if let Some(s) = check_vm_files() {
            signals.push(s);
        }

        if signals.is_empty() {
            info!("VM Detection: No VM signals detected — running on bare metal");
            return vec![];
        }

        let severity = if signals.len() >= 2 {
            Severity::Flag
        } else {
            Severity::Warn
        };

        let summary = format!(
            "VM detected: {} signal(s) — {}",
            signals.len(),
            signals.join(", ")
        );

        warn!("VM Detection: {}", summary);

        vec![DetectionEvent::new(
            MonitorSource::VmDetect,
            severity,
            (signals.len() as f64 / 5.0).min(1.0),
            summary,
            json!({
                "signals": signals,
                "signal_count": signals.len(),
            }),
        )]
    }
}

/// Check CPUID hypervisor presence via /proc/cpuinfo (Linux) or sysctl (macOS)
fn check_cpuid_hypervisor() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        if let Ok(cpuinfo) = fs::read_to_string("/proc/cpuinfo") {
            if cpuinfo.contains("hypervisor") {
                return Some("cpuid_hypervisor_flag".into());
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = Command::new("sysctl")
            .args(["-n", "machdep.cpu.features"])
            .output()
        {
            let features = String::from_utf8_lossy(&output.stdout);
            if features.to_lowercase().contains("vmm") {
                return Some("cpuid_vmm_flag".into());
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Modern: PowerShell Get-CimInstance (replaces deprecated wmic)
        if let Ok(output) = Command::new("powershell")
            .args(["-NoProfile", "-Command", "Get-CimInstance -ClassName Win32_ComputerSystem | Select-Object -ExpandProperty Model"])
            .output()
        {
            let model = String::from_utf8_lossy(&output.stdout).to_lowercase();
            if model.contains("virtual") || model.contains("vmware") || model.contains("kvm") {
                return Some(format!("cim_virtual_model:{}", model.trim()));
            }
        }
        // Fallback: legacy wmic
        if let Ok(output) = Command::new("wmic")
            .args(["computersystem", "get", "model"])
            .output()
        {
            let model = String::from_utf8_lossy(&output.stdout).to_lowercase();
            if model.contains("virtual") {
                return Some("wmic_virtual_model".into());
            }
        }
    }

    None
}

/// Check DMI/SMBIOS for VM vendor strings
fn check_dmi_strings() -> Option<String> {
    let vm_vendors = [
        "virtualbox", "vmware", "qemu", "kvm", "xen",
        "microsoft corporation", "parallels", "bochs",
        "innotek", "oracle",
    ];

    #[cfg(target_os = "linux")]
    {
        let dmi_paths = [
            "/sys/class/dmi/id/sys_vendor",
            "/sys/class/dmi/id/product_name",
            "/sys/class/dmi/id/board_vendor",
            "/sys/class/dmi/id/bios_vendor",
        ];

        for path in &dmi_paths {
            if let Ok(content) = fs::read_to_string(path) {
                let lower = content.to_lowercase();
                for vendor in &vm_vendors {
                    if lower.contains(vendor) {
                        return Some(format!("dmi_vendor:{}", vendor));
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Modern: PowerShell Get-CimInstance (replaces deprecated wmic)
        if let Ok(output) = Command::new("powershell")
            .args(["-NoProfile", "-Command", "Get-CimInstance -ClassName Win32_BIOS | Select-Object SerialNumber, Manufacturer | Format-List"])
            .output()
        {
            let bios = String::from_utf8_lossy(&output.stdout).to_lowercase();
            for vendor in &vm_vendors {
                if bios.contains(vendor) {
                    return Some(format!("cim_bios_vendor:{}", vendor));
                }
            }
        }
        // Fallback: legacy wmic
        if let Ok(output) = Command::new("wmic")
            .args(["bios", "get", "serialnumber,manufacturer"])
            .output()
        {
            let bios = String::from_utf8_lossy(&output.stdout).to_lowercase();
            for vendor in &vm_vendors {
                if bios.contains(vendor) {
                    return Some(format!("wmic_bios_vendor:{}", vendor));
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = Command::new("system_profiler")
            .args(["SPHardwareDataType"])
            .output()
        {
            let hw = String::from_utf8_lossy(&output.stdout).to_lowercase();
            for vendor in &vm_vendors {
                if hw.contains(vendor) {
                    return Some(format!("macos_hw_vendor:{}", vendor));
                }
            }
        }
    }

    None
}

/// Check for VM guest tools processes
fn check_vm_processes() -> Option<String> {
    let vm_processes = [
        "vboxservice", "vboxtray", "vboxclient",
        "vmtoolsd", "vmwaretray", "vmwareuser",
        "qemu-ga", "spice-vdagent",
        "xe-daemon", "xenservice",
        "prl_tools", "prl_cc",
        "VBoxService", "VBoxTray", "VBoxClient",
    ];

    let sys = sysinfo::System::new_with_specifics(
        sysinfo::RefreshKind::nothing().with_processes(sysinfo::ProcessRefreshKind::everything()),
    );

    for (_, process) in sys.processes() {
        let name = process.name().to_string_lossy().to_lowercase();
        for vm_proc in &vm_processes {
            if name.contains(&vm_proc.to_lowercase()) {
                return Some(format!("vm_process:{}", name));
            }
        }
    }

    None
}

/// Check MAC address OUI prefixes associated with VMs
fn check_mac_address() -> Option<String> {
    let vm_mac_prefixes = [
        "08:00:27", // VirtualBox
        "0a:00:27", // VirtualBox
        "00:0c:29", // VMware
        "00:50:56", // VMware
        "00:1c:42", // Parallels
        "00:16:3e", // Xen
        "52:54:00", // QEMU/KVM
        "00:15:5d", // Hyper-V
    ];

    #[cfg(target_os = "linux")]
    {
        if let Ok(entries) = fs::read_dir("/sys/class/net") {
            for entry in entries.flatten() {
                let addr_path = entry.path().join("address");
                if let Ok(mac) = fs::read_to_string(&addr_path) {
                    let mac = mac.trim().to_lowercase();
                    for prefix in &vm_mac_prefixes {
                        if mac.starts_with(prefix) {
                            return Some(format!("vm_mac_oui:{}", prefix));
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("getmac").args(["/fo", "csv", "/nh"]).output() {
            let macs = String::from_utf8_lossy(&output.stdout).to_lowercase();
            for prefix in &vm_mac_prefixes {
                let dash_prefix = prefix.replace(':', "-");
                if macs.contains(&dash_prefix) {
                    return Some(format!("vm_mac_oui:{}", prefix));
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = Command::new("ifconfig").output() {
            let ifconfig = String::from_utf8_lossy(&output.stdout).to_lowercase();
            for prefix in &vm_mac_prefixes {
                if ifconfig.contains(prefix) {
                    return Some(format!("vm_mac_oui:{}", prefix));
                }
            }
        }
    }

    None
}

/// Check for VM-specific device files
fn check_vm_files() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        let vm_files = [
            "/dev/vboxguest",
            "/dev/vboxuser",
            "/dev/vmci",
            "/proc/scsi/scsi", // often contains VM disk identifiers
        ];

        for path in &vm_files {
            if std::path::Path::new(path).exists() {
                // For /proc/scsi/scsi, check content for VM strings
                if *path == "/proc/scsi/scsi" {
                    if let Ok(content) = fs::read_to_string(path) {
                        let lower = content.to_lowercase();
                        if lower.contains("vmware") || lower.contains("vbox") || lower.contains("qemu") {
                            return Some(format!("vm_device_file:{}", path));
                        }
                    }
                    continue;
                }
                return Some(format!("vm_device_file:{}", path));
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Check for VM-specific registry keys
        let vm_reg_keys = [
            (r"HKLM\SOFTWARE\Oracle\VirtualBox Guest Additions", "vbox_guest_additions"),
            (r"HKLM\SOFTWARE\VMware, Inc.\VMware Tools", "vmware_tools"),
            (r"HKLM\SOFTWARE\Microsoft\Virtual Machine\Guest\Parameters", "hyperv_guest"),
        ];
        for (key, label) in &vm_reg_keys {
            if let Ok(output) = Command::new("reg")
                .args(["query", key])
                .output()
            {
                if output.status.success() {
                    return Some(format!("vm_registry:{}", label));
                }
            }
        }
    }

    None
}
