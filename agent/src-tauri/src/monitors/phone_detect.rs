use crate::evidence::{DetectionEvent, MonitorSource, Severity};
use log::{info, warn};
use ort::session::Session;
use ort::value::Tensor;
use serde_json::json;
use std::fs;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

/// Phone Detection Monitor
///
/// Detects phone/tablet presence through multiple independent signals:
///
/// 1. **USB device detection** — scans connected USB devices for known
///    Android (MTP/ADB) and iOS vendor IDs.
/// 2. **Phone-related processes** — flags processes like `adb`, `scrcpy`,
///    `iTunes`, `idevice*`, and phone management tools.
/// 3. **Tethering / hotspot interfaces** — detects USB tethering or phone
///    hotspot network interfaces that suggest a second device nearby.
/// 4. **Webcam ML** — on-device YOLO-nano ONNX inference to visually
///    detect phones in the webcam feed. No images ever leave the device.
pub struct PhoneDetector {
    // ── Webcam ML state ─────────────────────────────
    consecutive_detections: u32,
    required_consecutive: u32,
    min_confidence: f32,
    webcam_available: bool,
    onnx_session: Option<Session>,
    latest_frame: Arc<Mutex<Option<image::RgbImage>>>,
    #[allow(dead_code)]
    camera_running: Arc<AtomicBool>,
}

/// Represents a detected object in a frame
#[derive(Debug, Clone)]
pub struct Detection {
    pub class: String,
    pub confidence: f32,
    pub bbox: BoundingBox,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct BoundingBox {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

// ── Known USB vendor IDs for phones ─────────────────────────────────

const PHONE_USB_VENDORS: &[(&str, &str)] = &[
    ("18d1", "Google (Pixel / ADB)"),
    ("04e8", "Samsung"),
    ("22b8", "Motorola"),
    ("0bb4", "HTC"),
    ("2717", "Xiaomi"),
    ("12d1", "Huawei"),
    ("1004", "LG"),
    ("2a70", "OnePlus"),
    ("0fce", "Sony Mobile"),
    ("2916", "Android Debug Bridge"),
    ("1949", "Amazon (Fire)"),
    ("2ae5", "Fairphone"),
    ("05ac", "Apple"),
    ("1532", "Razer Phone"),
    ("0e8d", "MediaTek (generic Android)"),
    ("19d2", "ZTE"),
    ("1bbb", "T-Mobile (REVVL)"),
    ("2b4c", "Realme"),
    ("2a45", "Meizu"),
    ("1ebf", "Xiaomi (sub-brand)"),
];

const PHONE_PROCESSES: &[(&str, &str)] = &[
    ("adb", "Android Debug Bridge"),
    ("scrcpy", "Android screen mirror"),
    ("vysor", "Vysor screen mirror"),
    ("itunes", "Apple iTunes"),
    ("idevice", "libimobiledevice tool"),
    ("usbmuxd", "iOS USB multiplexer"),
    ("iproxy", "iOS proxy"),
    ("android-file-transfer", "Android file transfer"),
    ("samsung-dex", "Samsung DeX"),
    ("smartswitch", "Samsung Smart Switch"),
    ("phone-link", "Windows Phone Link"),
    ("your-phone", "Windows Your Phone"),
    ("kde-connect", "KDE Connect"),
    ("gsconnect", "GNOME GSConnect"),
];

/// COCO class index → name (phone-relevant subset)
fn coco_class_name(id: usize) -> String {
    match id {
        67 => "cell phone".into(),
        63 => "laptop".into(),
        73 => "book".into(),
        _ => format!("class_{}", id),
    }
}

impl PhoneDetector {
    pub fn new() -> Self {
        let latest_frame: Arc<Mutex<Option<image::RgbImage>>> = Arc::new(Mutex::new(None));
        let camera_running = Arc::new(AtomicBool::new(false));

        // Try to load ONNX model
        let model_path = Self::find_model_path();
        let onnx_session = model_path.as_ref().and_then(|p| {
            Self::load_onnx_session(p)
        });

        // Start webcam capture if model loaded and camera is available
        let webcam_available = onnx_session.is_some() && Self::has_camera();
        if webcam_available {
            camera_running.store(true, Ordering::Relaxed);
            Self::start_camera_thread(
                Arc::clone(&latest_frame),
                Arc::clone(&camera_running),
            );
            info!("Phone Detector: Webcam ML pipeline active (model + camera ready)");
        } else if onnx_session.is_some() {
            info!("Phone Detector: ONNX model loaded but no camera — webcam ML disabled");
        } else {
            info!("Phone Detector: No ONNX model found — webcam ML disabled");
        }
        info!("Phone Detector: USB/process/tethering monitoring active");

        Self {
            consecutive_detections: 0,
            required_consecutive: 3,
            min_confidence: 0.5,
            webcam_available,
            onnx_session,
            latest_frame,
            camera_running,
        }
    }

    // ── Model loading ───────────────────────────────────────────────

    fn find_model_path() -> Option<std::path::PathBuf> {
        let candidates = [
            "models/yolo11n.onnx",
            "models/yolov8n.onnx",
        ];
        for path in &candidates {
            let p = std::path::Path::new(path);
            if p.exists() {
                info!("Phone Detector: Found model at {}", path);
                return Some(p.to_path_buf());
            }
        }
        None
    }

    fn load_onnx_session(model_path: &std::path::Path) -> Option<Session> {
        use ort::session::builder::GraphOptimizationLevel;

        match Session::builder()
            .and_then(|b| b.with_optimization_level(GraphOptimizationLevel::Level3))
            .and_then(|b| b.commit_from_file(model_path))
        {
            Ok(session) => {
                info!("Phone Detector: ONNX session created from {:?}", model_path);
                Some(session)
            }
            Err(e) => {
                warn!("Phone Detector: Failed to load ONNX model: {}", e);
                None
            }
        }
    }

    // ── Camera ──────────────────────────────────────────────────────

    fn has_camera() -> bool {
        #[cfg(target_os = "linux")]
        {
            return std::path::Path::new("/dev/video0").exists();
        }
        #[cfg(not(target_os = "linux"))]
        {
            true // Assume camera exists on Windows/macOS; nokhwa will error if not
        }
    }

    fn start_camera_thread(
        frame_buf: Arc<Mutex<Option<image::RgbImage>>>,
        running: Arc<AtomicBool>,
    ) {
        std::thread::spawn(move || {
            use nokhwa::pixel_format::RgbFormat;
            use nokhwa::utils::{CameraIndex, RequestedFormat, RequestedFormatType};
            use nokhwa::Camera;

            let requested = RequestedFormat::new::<RgbFormat>(
                RequestedFormatType::AbsoluteHighestFrameRate,
            );

            let mut camera = match Camera::new(CameraIndex::Index(0), requested) {
                Ok(c) => c,
                Err(e) => {
                    warn!("Phone Detector: Failed to open camera: {}", e);
                    running.store(false, Ordering::Relaxed);
                    return;
                }
            };

            if let Err(e) = camera.open_stream() {
                warn!("Phone Detector: Failed to start camera stream: {}", e);
                running.store(false, Ordering::Relaxed);
                return;
            }

            info!("Phone Detector: Camera capture thread running");

            while running.load(Ordering::Relaxed) {
                match camera.frame() {
                    Ok(buffer) => {
                        match buffer.decode_image::<RgbFormat>() {
                            Ok(img) => {
                                *frame_buf.lock().unwrap() = Some(img);
                            }
                            Err(e) => {
                                warn!("Phone Detector: Frame decode error: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        warn!("Phone Detector: Frame capture error: {}", e);
                    }
                }
                // Capture ~2 FPS (scan cycle will pick up the latest frame)
                std::thread::sleep(std::time::Duration::from_millis(500));
            }
        });
    }

    // ── Inference pipeline ──────────────────────────────────────────

    fn run_inference(&mut self) -> Vec<Detection> {
        let session = match &mut self.onnx_session {
            Some(s) => s,
            None => return vec![],
        };

        // Grab the latest frame from the camera thread
        let frame = {
            let mut guard = self.latest_frame.lock().unwrap();
            guard.take() // Take it so we don't re-process the same frame
        };
        let frame = match frame {
            Some(f) => f,
            None => return vec![],
        };

        // Preprocess: resize to 640×640, normalize to [0,1], NCHW layout
        let input = Self::preprocess(&frame);

        // Create ONNX tensor from ndarray
        let input_tensor = match Tensor::from_array(input) {
            Ok(t) => t,
            Err(e) => {
                warn!("Phone Detector: Tensor creation error: {}", e);
                return vec![];
            }
        };

        // Run ONNX inference
        let outputs = match session.run(ort::inputs![input_tensor]) {
            Ok(o) => o,
            Err(e) => {
                warn!("Phone Detector: ONNX inference error: {}", e);
                return vec![];
            }
        };

        // Extract output tensor — returns (&Shape, &[f32])
        let (shape, data) = match outputs[0].try_extract_tensor::<f32>() {
            Ok(t) => t,
            Err(e) => {
                warn!("Phone Detector: Output extraction error: {}", e);
                return vec![];
            }
        };
        let shape: Vec<usize> = shape.iter().map(|&d| d as usize).collect();

        // Post-process: filter by confidence, apply NMS, keep phone classes
        Self::postprocess(&shape, data, self.min_confidence)
    }

    /// Resize to 640×640 and convert to [1, 3, 640, 640] float32 tensor
    fn preprocess(frame: &image::RgbImage) -> ndarray::Array4<f32> {
        use image::imageops::FilterType;

        let resized = image::imageops::resize(frame, 640, 640, FilterType::Triangle);

        let mut input = ndarray::Array4::<f32>::zeros((1, 3, 640, 640));
        for (x, y, pixel) in resized.enumerate_pixels() {
            let (xu, yu) = (x as usize, y as usize);
            input[[0, 0, yu, xu]] = pixel[0] as f32 / 255.0; // R
            input[[0, 1, yu, xu]] = pixel[1] as f32 / 255.0; // G
            input[[0, 2, yu, xu]] = pixel[2] as f32 / 255.0; // B
        }
        input
    }

    /// Decode YOLO output [1, 84, 8400] into detections
    fn postprocess(
        shape: &[usize],
        data: &[f32],
        conf_threshold: f32,
    ) -> Vec<Detection> {
        // Output shape: [1, 84, 8400]
        // 84 = 4 bbox coords + 80 COCO class scores
        // 8400 = number of detection proposals
        if shape.len() != 3 || shape[1] < 84 {
            warn!(
                "Phone Detector: Unexpected output shape {:?}, expected [1, 84, 8400]",
                shape
            );
            return vec![];
        }

        let num_attrs = shape[1]; // 84
        let num_classes = num_attrs - 4;
        let num_proposals = shape[2]; // 8400
        let mut detections = Vec::new();

        for i in 0..num_proposals {
            // data is laid out as [batch][attr][proposal] in row-major order
            // Index: batch=0, attr=a, proposal=i → 0 * (num_attrs * num_proposals) + a * num_proposals + i
            let idx = |a: usize| -> usize { a * num_proposals + i };

            let x_center = data[idx(0)];
            let y_center = data[idx(1)];
            let w = data[idx(2)];
            let h = data[idx(3)];

            // Find the class with the highest score
            let mut best_class = 0usize;
            let mut best_score = 0.0f32;
            for c in 0..num_classes {
                let score = data[idx(4 + c)];
                if score > best_score {
                    best_score = score;
                    best_class = c;
                }
            }

            if best_score >= conf_threshold {
                detections.push(Detection {
                    class: coco_class_name(best_class),
                    confidence: best_score,
                    bbox: BoundingBox {
                        x: (x_center - w / 2.0) / 640.0,
                        y: (y_center - h / 2.0) / 640.0,
                        width: w / 640.0,
                        height: h / 640.0,
                    },
                });
            }
        }

        nms(&mut detections, 0.45);
        detections
    }

    // ── USB device detection ────────────────────────────────────────

    fn check_usb_devices() -> Vec<String> {
        let mut signals = Vec::new();

        #[cfg(target_os = "linux")]
        {
            if let Ok(entries) = fs::read_dir("/sys/bus/usb/devices") {
                for entry in entries.flatten() {
                    let vendor_path = entry.path().join("idVendor");
                    let product_path = entry.path().join("idProduct");
                    if let Ok(vendor) = fs::read_to_string(&vendor_path) {
                        let vendor = vendor.trim().to_lowercase();
                        for &(vid, label) in PHONE_USB_VENDORS {
                            if vendor == vid {
                                let product = fs::read_to_string(&product_path)
                                    .unwrap_or_default()
                                    .trim()
                                    .to_string();
                                signals.push(format!(
                                    "usb_device:{}:{} ({})",
                                    vid, product, label
                                ));
                            }
                        }
                    }
                }
            }

            if signals.is_empty() {
                if let Ok(output) = Command::new("lsusb").output() {
                    let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
                    for &(vid, label) in PHONE_USB_VENDORS {
                        if stdout.contains(vid) {
                            signals.push(format!("lsusb_vendor:{} ({})", vid, label));
                        }
                    }
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            if let Ok(output) = Command::new("system_profiler")
                .args(["SPUSBDataType"])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
                let phone_keywords = [
                    "iphone", "ipad", "android", "samsung", "pixel",
                    "xiaomi", "huawei", "oneplus", "mtp", "adb",
                ];
                for keyword in &phone_keywords {
                    if stdout.contains(keyword) {
                        signals.push(format!("macos_usb:{}", keyword));
                    }
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            if let Ok(output) = Command::new("powershell")
                .args([
                    "-NoProfile", "-Command",
                    "Get-PnpDevice -Class USB -Status OK -ErrorAction SilentlyContinue | Select-Object -ExpandProperty InstanceId",
                ])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
                for &(vid, label) in PHONE_USB_VENDORS {
                    let search = format!("vid_{}", vid);
                    if stdout.contains(&search) {
                        signals.push(format!("pnp_device:{} ({})", vid, label));
                    }
                }
            }

            if let Ok(output) = Command::new("powershell")
                .args([
                    "-NoProfile", "-Command",
                    "Get-PnpDevice -FriendlyName '*Android*','*ADB*','*iPhone*','*iPad*','*MTP*' -Status OK -ErrorAction SilentlyContinue | Select-Object FriendlyName | Format-List",
                ])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
                if !stdout.trim().is_empty() {
                    signals.push(format!("pnp_friendly:{}", stdout.trim().replace('\n', "; ")));
                }
            }
        }

        signals
    }

    // ── Phone-related process detection ─────────────────────────────

    fn check_phone_processes() -> Vec<String> {
        let mut signals = Vec::new();

        let sys = sysinfo::System::new_with_specifics(
            sysinfo::RefreshKind::nothing()
                .with_processes(sysinfo::ProcessRefreshKind::everything()),
        );

        for (_pid, process) in sys.processes() {
            let name = process.name().to_string_lossy().to_lowercase();
            let exe_path = process
                .exe()
                .map(|p| p.to_string_lossy().to_lowercase())
                .unwrap_or_default();

            for &(keyword, label) in PHONE_PROCESSES {
                if name.contains(keyword) || exe_path.contains(keyword) {
                    let sig = format!("phone_process:{}:{} ({})", keyword, name, label);
                    if !signals.contains(&sig) {
                        signals.push(sig);
                    }
                }
            }
        }

        signals
    }

    // ── Tethering / hotspot detection ───────────────────────────────

    fn check_tethering() -> Vec<String> {
        let mut signals = Vec::new();

        #[cfg(target_os = "linux")]
        {
            if let Ok(entries) = fs::read_dir("/sys/class/net") {
                for entry in entries.flatten() {
                    let iface = entry.file_name().to_string_lossy().to_lowercase();

                    if iface.starts_with("usb")
                        || iface.starts_with("rndis")
                        || iface.starts_with("enx")
                    {
                        let operstate_path = entry.path().join("operstate");
                        let is_up = fs::read_to_string(&operstate_path)
                            .map(|s| s.trim() == "up")
                            .unwrap_or(false);
                        if is_up {
                            signals.push(format!("tethering_iface:{}", iface));
                        }
                    }

                    if iface.starts_with("bnep") {
                        signals.push(format!("bluetooth_pan:{}", iface));
                    }
                }
            }

            if let Ok(modules) = fs::read_to_string("/proc/modules") {
                let lower = modules.to_lowercase();
                if lower.contains("rndis_host") {
                    signals.push("kernel_module:rndis_host".into());
                }
                if lower.contains("cdc_ether") {
                    signals.push("kernel_module:cdc_ether".into());
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            if let Ok(output) = Command::new("ifconfig").output() {
                let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
                if stdout.contains("iphone") {
                    signals.push("macos_tether:iphone_usb".into());
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            if let Ok(output) = Command::new("powershell")
                .args([
                    "-NoProfile", "-Command",
                    "Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceDescription -match 'RNDIS|Android|iPhone|Remote NDIS|USB Ethernet' -and $_.Status -eq 'Up' } | Select-Object Name, InterfaceDescription | Format-List",
                ])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if !stdout.trim().is_empty() {
                    signals.push(format!(
                        "win_tether:{}",
                        stdout.trim().replace('\n', "; ")
                    ));
                }
            }
        }

        signals
    }
}

// ── NMS helpers ─────────────────────────────────────────────────────

fn iou(a: &BoundingBox, b: &BoundingBox) -> f32 {
    let x1 = a.x.max(b.x);
    let y1 = a.y.max(b.y);
    let x2 = (a.x + a.width).min(b.x + b.width);
    let y2 = (a.y + a.height).min(b.y + b.height);

    let intersection = (x2 - x1).max(0.0) * (y2 - y1).max(0.0);
    let area_a = a.width * a.height;
    let area_b = b.width * b.height;
    let union = area_a + area_b - intersection;

    if union <= 0.0 { 0.0 } else { intersection / union }
}

fn nms(detections: &mut Vec<Detection>, iou_threshold: f32) {
    detections.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap());
    let mut keep = vec![true; detections.len()];

    for i in 0..detections.len() {
        if !keep[i] { continue; }
        for j in (i + 1)..detections.len() {
            if !keep[j] { continue; }
            if detections[i].class == detections[j].class
                && iou(&detections[i].bbox, &detections[j].bbox) > iou_threshold
            {
                keep[j] = false;
            }
        }
    }

    let mut idx = 0;
    detections.retain(|_| {
        let k = keep[idx];
        idx += 1;
        k
    });
}

// ── Monitor trait impl ──────────────────────────────────────────────

impl super::Monitor for PhoneDetector {
    fn name(&self) -> &str {
        "Phone Detector"
    }

    fn scan(&mut self) -> Vec<DetectionEvent> {
        let mut events = Vec::new();

        // ── Signal 1: USB devices ───────────────────────────────────
        let usb_signals = Self::check_usb_devices();
        if !usb_signals.is_empty() {
            warn!(
                "Phone Detector: Phone USB device(s) detected — {}",
                usb_signals.join(", ")
            );
            events.push(DetectionEvent::new(
                MonitorSource::PhoneDetect,
                Severity::Flag,
                0.95,
                format!(
                    "Phone connected via USB: {} signal(s)",
                    usb_signals.len()
                ),
                json!({
                    "detection_type": "usb_device",
                    "signals": usb_signals,
                }),
            ));
        }

        // ── Signal 2: Phone-related processes ───────────────────────
        let proc_signals = Self::check_phone_processes();
        if !proc_signals.is_empty() {
            warn!(
                "Phone Detector: Phone-related process(es) detected — {}",
                proc_signals.join(", ")
            );
            events.push(DetectionEvent::new(
                MonitorSource::PhoneDetect,
                Severity::Warn,
                0.85,
                format!(
                    "Phone-related process detected: {} signal(s)",
                    proc_signals.len()
                ),
                json!({
                    "detection_type": "phone_process",
                    "signals": proc_signals,
                }),
            ));
        }

        // ── Signal 3: Tethering / hotspot ───────────────────────────
        let tether_signals = Self::check_tethering();
        if !tether_signals.is_empty() {
            warn!(
                "Phone Detector: Phone tethering/hotspot detected — {}",
                tether_signals.join(", ")
            );
            events.push(DetectionEvent::new(
                MonitorSource::PhoneDetect,
                Severity::Warn,
                0.80,
                format!(
                    "Phone tethering detected: {} signal(s)",
                    tether_signals.len()
                ),
                json!({
                    "detection_type": "tethering",
                    "signals": tether_signals,
                }),
            ));
        }

        // ── Signal 4: Webcam ML inference ───────────────────────────
        if self.webcam_available {
            let detections = self.run_inference();

            // Keep only phone/tablet detections
            let phone_detections: Vec<&Detection> = detections
                .iter()
                .filter(|d| d.class == "cell phone" || d.class == "tablet")
                .collect();

            if phone_detections.is_empty() {
                if self.consecutive_detections > 0 {
                    info!(
                        "Phone Detector: Phone no longer visible (was {} consecutive frames)",
                        self.consecutive_detections
                    );
                }
                self.consecutive_detections = 0;
            } else {
                self.consecutive_detections += 1;
                let best = phone_detections
                    .iter()
                    .max_by(|a, b| a.confidence.partial_cmp(&b.confidence).unwrap())
                    .unwrap();

                if self.consecutive_detections >= self.required_consecutive {
                    warn!(
                        "Phone Detector: Phone visible for {} frames (conf: {:.2})",
                        self.consecutive_detections, best.confidence
                    );
                    events.push(DetectionEvent::new(
                        MonitorSource::PhoneDetect,
                        Severity::Flag,
                        best.confidence as f64,
                        format!(
                            "Phone/tablet visible in webcam for {} consecutive frames",
                            self.consecutive_detections
                        ),
                        json!({
                            "detection_type": "webcam_ml",
                            "consecutive_frames": self.consecutive_detections,
                            "best_confidence": best.confidence,
                            "class": best.class,
                            "bounding_box": best.bbox,
                            "note": "No image data transmitted — only detection metadata"
                        }),
                    ));
                }
            }
        }

        if events.is_empty() {
            info!("Phone Detector: No phone signals detected");
        }

        events
    }
}
