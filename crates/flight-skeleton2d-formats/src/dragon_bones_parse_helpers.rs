use std::collections::HashMap;

use flight_animation::contract::AnimationInterpolation;
use flight_easing::contract::ease_cubic_bezier;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use serde::Serialize;
use serde_json::{Map, Value};

use crate::types::JsonRecord;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DragonBonesBoneTransform {
    pub rotation: f32,
    pub scale_x: f32,
    pub scale_y: f32,
    pub shear_y: f32,
    pub x: f32,
    pub y: f32,
}

pub fn build_dragon_bones_segment_easings(
    frames: &[JsonRecord],
) -> Option<Vec<Option<flight_animation::EasingFn>>> {
    let segments = frames.len().saturating_sub(1);
    if segments == 0 {
        return None;
    }
    let mut easings = Vec::with_capacity(segments);
    let mut curved = false;
    for frame in frames.iter().take(segments) {
        let Some(curve) = frame
            .get("curve")
            .and_then(Value::as_array)
            .filter(|curve| curve.len() >= 4)
        else {
            easings.push(None);
            continue;
        };
        curved = true;
        easings.push(Some(ease_cubic_bezier(
            clamp_dragon_bones_unit(number_or(curve.first(), 0.0)),
            number_or(curve.get(1), 0.0),
            clamp_dragon_bones_unit(number_or(curve.get(2), 1.0)),
            number_or(curve.get(3), 1.0),
        )));
    }
    return curved.then_some(easings);
}

fn clamp_dragon_bones_unit(value: f32) -> f32 {
    return value.clamp(0.0, 1.0);
}

pub fn dragon_bones_frame_times(frames: &[JsonRecord], frame_rate: f32) -> Vec<f32> {
    let mut times = Vec::with_capacity(frames.len());
    let mut elapsed = 0.0;
    for frame in frames {
        times.push(elapsed / frame_rate);
        elapsed += number_or(frame.get("duration"), 1.0).max(0.0);
    }
    return times;
}

pub fn dragon_bones_frames<T: Serialize>(
    raw: Option<&T>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Vec<JsonRecord> {
    let Some(raw) = raw
        .and_then(|value| serde_json::to_value(value).ok())
        .and_then(|value| value.as_array().cloned())
    else {
        return Vec::new();
    };
    let mut frames = Vec::with_capacity(raw.len());
    let mut recovered = 0;
    for entry in raw {
        if let Some(frame) = entry.as_object() {
            frames.push(JsonRecord::from(frame.clone()));
        } else {
            frames.push(JsonRecord::new());
            recovered += 1;
        }
    }
    if recovered > 0 {
        let mut detail = HashMap::new();
        detail.insert(
            "frames".to_string(),
            ImportDiagnosticDetailValue::Number(recovered as f32),
        );
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Recover,
            "dragonbones.malformed-frame-recovered",
            "dragonBonesFrames",
            Some(detail),
        );
    }
    return frames;
}

pub fn dragon_bones_interpolation(
    frames: &[JsonRecord],
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> AnimationInterpolation {
    let mut stepped = true;
    let mut approximated = 0;
    for frame in frames.iter().take(frames.len().saturating_sub(1)) {
        if !is_dragon_bones_frame_stepped(frame) {
            stepped = false;
        }
        if !frame.contains_key("curve") {
            if let Some(easing) = frame.get("tweenEasing").and_then(Value::as_f64) {
                if easing != 0.0 && easing != 100.0 {
                    approximated += 1;
                }
            }
        }
    }
    if approximated > 0 {
        let mut detail = HashMap::new();
        detail.insert(
            "frames".to_string(),
            ImportDiagnosticDetailValue::Number(approximated as f32),
        );
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Recover,
            "dragonbones.tween-easing-approximated",
            "dragonBonesInterpolation",
            Some(detail),
        );
    }
    return if stepped {
        AnimationInterpolation::Step
    } else {
        AnimationInterpolation::Linear
    };
}

fn is_dragon_bones_frame_stepped(frame: &JsonRecord) -> bool {
    if frame.contains_key("curve") || !frame.contains_key("tweenEasing") {
        return false;
    }
    return frame
        .get("tweenEasing")
        .is_none_or(|value| value.is_null() || value.as_f64() == Some(100.0));
}

pub fn number_or<T: Serialize>(value: Option<&T>, fallback: f32) -> f32 {
    return value
        .and_then(|value| serde_json::to_value(value).ok())
        .and_then(|value| value.as_f64())
        .map(|number| number as f32)
        .unwrap_or(fallback);
}

pub fn parse_dragon_bones_bone_transform<T: Serialize>(
    raw: Option<&T>,
) -> DragonBonesBoneTransform {
    let raw = raw.and_then(|value| serde_json::to_value(value).ok());
    let transform = raw.as_ref().and_then(Value::as_object);
    let modern = transform
        .is_some_and(|record| record.contains_key("rotate") || record.contains_key("skew"));
    let rotation = if modern {
        number_or(transform.and_then(|record| record.get("rotate")), 0.0)
    } else {
        number_or(transform.and_then(|record| record.get("skY")), 0.0)
    };
    let shear_y = if modern {
        number_or(transform.and_then(|record| record.get("skew")), 0.0)
    } else {
        number_or(transform.and_then(|record| record.get("skX")), 0.0) - rotation
    };
    return DragonBonesBoneTransform {
        rotation,
        scale_x: number_or(transform.and_then(|record| record.get("scX")), 1.0),
        scale_y: number_or(transform.and_then(|record| record.get("scY")), 1.0),
        shear_y,
        x: number_or(transform.and_then(|record| record.get("x")), 0.0),
        y: number_or(transform.and_then(|record| record.get("y")), 0.0),
    };
}

pub fn skip_crumb_dragon_bones_group<T: Serialize>(
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    raw: Option<&T>,
    kind: &str,
) {
    let count = raw
        .and_then(|value| serde_json::to_value(value).ok())
        .and_then(|value| {
            value
                .as_array()
                .map(Vec::len)
                .or_else(|| value.as_object().map(Map::len))
        })
        .unwrap_or(0);
    if count == 0 {
        return;
    }
    let mut detail = HashMap::new();
    detail.insert(
        "count".to_string(),
        ImportDiagnosticDetailValue::Number(count as f32),
    );
    report_import_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Skip,
        kind,
        "parseDragonBonesSkeleton",
        Some(detail),
    );
}
