use crate::evidence::{DetectionEvent, MonitorSource, Severity};
use log::{info, warn};
use serde_json::json;

/// Phone Detection Monitor (Webcam-based)
///
/// Uses on-device ML to detect phones/tablets in the webcam feed.
/// Privacy-first: no video or frames ever leave the device.
/// Only detection metadata (timestamp, confidence, bounding box) is reported.
///
/// NOTE: This module requires the `ort` (ONNX Runtime) and `nokhwa` crates
/// which are optional heavy dependencies. The core detection logic is
/// implemented here; the actual ML inference is stubbed until the model
/// file (YOLOv8-nano) is placed in the models/ directory.
///
/// For now, this module provides the full pipeline structure and will
/// be activated when the ONNX model is available.
pub struct PhoneDetector {
    /// Consecutive frame count with phone detected
    consecutive_detections: u32,
    /// Required consecutive frames before flagging (avoids false positives)
    required_consecutive: u32,
    /// Minimum model confidence to consider a detection valid
    min_confidence: f32,
    /// Whether the webcam/model is available
    is_available: bool,
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

impl PhoneDetector {
    pub fn new() -> Self {
        let is_available = Self::check_availability();

        if is_available {
            info!("Phone Detector: Webcam and model available — monitoring active");
        } else {
            info!("Phone Detector: Webcam or model not available — monitoring disabled");
        }

        Self {
            consecutive_detections: 0,
            required_consecutive: 3,
            min_confidence: 0.85,
            is_available,
        }
    }

    /// Check if webcam and model file are available
    fn check_availability() -> bool {
        // Check if model file exists
        let model_path = std::path::Path::new("models/yolov8n.onnx");
        if !model_path.exists() {
            info!("Phone Detector: Model file not found at {:?}", model_path);
            return false;
        }

        // Check if webcam is accessible
        #[cfg(target_os = "linux")]
        {
            let has_webcam = std::path::Path::new("/dev/video0").exists();
            if !has_webcam {
                info!("Phone Detector: No webcam device found");
                return false;
            }
        }

        true
    }

    /// Capture a frame from the webcam and run inference
    /// Returns detected objects (phones, tablets, etc.)
    fn detect_objects(&self) -> Vec<Detection> {
        if !self.is_available {
            return vec![];
        }

        // =================================================================
        // INFERENCE PIPELINE (to be connected when ort + nokhwa are added)
        // =================================================================
        // 1. Capture frame from webcam via nokhwa
        //    let frame = camera.frame().unwrap();
        //
        // 2. Preprocess: resize to 640x640, normalize to [0,1], NCHW format
        //    let input = preprocess_frame(&frame);
        //
        // 3. Run ONNX inference
        //    let outputs = session.run(inputs![input])?;
        //
        // 4. Post-process: NMS, filter by confidence
        //    let detections = postprocess(outputs, self.min_confidence);
        //
        // 5. Filter for phone/tablet classes only
        //    COCO class 67 = "cell phone", class 73 = "laptop"
        //    detections.retain(|d| d.class == "cell phone" || d.class == "tablet");
        // =================================================================

        // Stub: returns empty until model is connected
        vec![]
    }

    /// Phone-relevant COCO class IDs
    fn is_phone_class(class_id: usize) -> bool {
        matches!(class_id,
            67  // cell phone
            // Additional classes to watch for:
            // 63 = laptop (might indicate second device)
            // 73 = book (could be hiding phone)
        )
    }
}

impl super::Monitor for PhoneDetector {
    fn name(&self) -> &str {
        "Phone Detector"
    }

    fn scan(&mut self) -> Vec<DetectionEvent> {
        if !self.is_available {
            return vec![];
        }

        let detections = self.detect_objects();

        // Find phone detections above confidence threshold
        let phone_detections: Vec<&Detection> = detections
            .iter()
            .filter(|d| {
                (d.class == "cell phone" || d.class == "tablet")
                    && d.confidence >= self.min_confidence
            })
            .collect();

        if phone_detections.is_empty() {
            // Reset consecutive counter — no phone in this frame
            if self.consecutive_detections > 0 {
                info!(
                    "Phone Detector: Phone no longer detected (was {} consecutive frames)",
                    self.consecutive_detections
                );
            }
            self.consecutive_detections = 0;
            return vec![];
        }

        self.consecutive_detections += 1;

        let best = phone_detections
            .iter()
            .max_by(|a, b| a.confidence.partial_cmp(&b.confidence).unwrap())
            .unwrap();

        if self.consecutive_detections >= self.required_consecutive {
            warn!(
                "Phone Detector: Phone detected for {} consecutive frames (conf: {:.2})",
                self.consecutive_detections, best.confidence
            );

            return vec![DetectionEvent::new(
                MonitorSource::PhoneDetect,
                Severity::Flag,
                best.confidence as f64,
                format!(
                    "Phone/tablet detected for {} consecutive frames",
                    self.consecutive_detections
                ),
                json!({
                    "consecutive_frames": self.consecutive_detections,
                    "best_confidence": best.confidence,
                    "class": best.class,
                    "bounding_box": best.bbox,
                    "note": "No image data transmitted — only detection metadata"
                }),
            )];
        }

        // Not enough consecutive frames yet — just WATCH
        if self.consecutive_detections == 1 {
            info!(
                "Phone Detector: Possible phone in frame (conf: {:.2}) — watching",
                best.confidence
            );
        }

        vec![]
    }
}
