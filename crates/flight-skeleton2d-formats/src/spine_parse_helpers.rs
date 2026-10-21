use std::collections::HashMap;

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_skeleton2d::contract::{Bone2D, Slot2D};
use serde_json::Value;

pub const SPINE_DEFAULT_SKIN_NAME: &str = "default";
pub const SPINE_NO_ATTACHMENT_INDEX: i32 = -1;

pub fn build_spine_segment_easings(
    keys: &[&serde_json::Map<String, Value>],
    times: &[f32],
    values: &[f32],
    components: usize,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Vec<Option<flight_animation::EasingFn>>> {
    let _ = (keys, times, values, components, diagnostics);
    // The landed AnimationTrack currently exposes function pointers rather than owned easing closures.
    // Preserve the source's absence sentinel until that core contract can carry per-segment controls.
    return None;
}

pub fn clamp_unit(value: f32) -> f32 {
    return value.clamp(0.0, 1.0);
}

pub fn index_of_bone(bones: &[Bone2D], name: &str) -> i32 {
    return bones
        .iter()
        .position(|bone| bone.name.as_deref() == Some(name))
        .map(|index| index as i32)
        .unwrap_or(-1);
}

pub fn index_of_spine_slot(slots: &[Slot2D], name: &str) -> i32 {
    return slots
        .iter()
        .position(|slot| slot.name.as_deref() == Some(name))
        .map(|index| index as i32)
        .unwrap_or(-1);
}

pub fn number_or(value: Option<&Value>, fallback: f32) -> f32 {
    return value
        .and_then(Value::as_f64)
        .map(|number| number as f32)
        .unwrap_or(fallback);
}

pub fn parse_spine_color(value: Option<&Value>) -> u32 {
    let Some(text) = value.and_then(Value::as_str) else {
        return u32::MAX;
    };
    if text.len() != 8 {
        return u32::MAX;
    }
    return u32::from_str_radix(text, 16).unwrap_or(u32::MAX);
}

pub fn skip_crumb_spine_timeline_group(
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    raw: Option<&Value>,
    kind: &str,
) {
    let count = raw
        .and_then(|value| {
            value
                .as_array()
                .map(Vec::len)
                .or_else(|| value.as_object().map(serde_json::Map::len))
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
        "parseSpineAnimations",
        Some(detail),
    );
}
