use std::collections::HashMap;

use flight_easing::contract::ease_cubic_bezier;
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
    let segments = times.len().saturating_sub(1);
    if segments == 0 {
        return None;
    }
    let mut easings = Vec::with_capacity(segments);
    let mut curved = false;
    let mut clamped_segments = 0;
    let mut divergent_segments = 0;
    for index in 0..segments {
        let Some(curve) = keys
            .get(index)
            .and_then(|key| key.get("curve"))
            .and_then(Value::as_array)
        else {
            easings.push(None);
            continue;
        };
        let span = times[index + 1] - times[index];
        if span <= 0.0 {
            easings.push(None);
            continue;
        }
        let mut winner = None;
        let mut widest = 0.0;
        for component in 0..components.min(curve.len() / 4) {
            let from_index = index * components + component;
            let to_index = (index + 1) * components + component;
            let Some((&from, &to)) = values.get(from_index).zip(values.get(to_index)) else {
                continue;
            };
            let rise = (to - from).abs();
            if rise > widest {
                widest = rise;
                winner = Some(component);
            }
        }
        let rebase = |component: usize| -> Option<[f32; 4]> {
            let from = *values.get(index * components + component)?;
            let rise = *values.get((index + 1) * components + component)? - from;
            if rise == 0.0 {
                return None;
            }
            let offset = component * 4;
            Some([
                (number_or(curve.get(offset), 0.0) - times[index]) / span,
                (number_or(curve.get(offset + 1), 0.0) - from) / rise,
                (number_or(curve.get(offset + 2), 0.0) - times[index]) / span,
                (number_or(curve.get(offset + 3), 0.0) - from) / rise,
            ])
        };
        let won = winner.and_then(rebase);
        let mut diverged = false;
        if let Some(won) = won {
            for component in 0..components.min(curve.len() / 4) {
                if Some(component) == winner {
                    continue;
                }
                let Some(other) = rebase(component) else {
                    continue;
                };
                if other
                    .iter()
                    .zip(won)
                    .any(|(other, won)| (other - won).abs() > 1e-6)
                {
                    diverged = true;
                }
            }
            if diverged {
                divergent_segments += 1;
            }
            let x1 = clamp_unit(won[0]);
            let x2 = clamp_unit(won[2]);
            if x1 != won[0] || x2 != won[2] {
                clamped_segments += 1;
            }
            curved = true;
            easings.push(Some(ease_cubic_bezier(x1, won[1], x2, won[3])));
        } else {
            easings.push(None);
        }
    }
    let mut diagnostics = diagnostics;
    if clamped_segments > 0 {
        let mut detail = HashMap::new();
        detail.insert(
            "segments".to_string(),
            ImportDiagnosticDetailValue::Number(clamped_segments as f32),
        );
        report_import_diagnostic(
            diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Recover,
            "spine.curve-time-overshoot-clamped",
            "buildSpineSegmentEasings",
            Some(detail),
        );
    }
    if divergent_segments > 0 {
        let mut detail = HashMap::new();
        detail.insert(
            "segments".to_string(),
            ImportDiagnosticDetailValue::Number(divergent_segments as f32),
        );
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Skip,
            "spine.per-component-curve-easing-unsupported",
            "buildSpineSegmentEasings",
            Some(detail),
        );
    }
    return curved.then_some(easings);
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
