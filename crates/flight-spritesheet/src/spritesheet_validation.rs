use std::collections::HashSet;
use std::sync::Arc;

use flight_entity::{entries, unknown_to_js_string};

use crate::types::*;

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS SpritesheetParseDiagnosticSeverity string union; the TS package exports no get_/parse_ free functions
pub fn get_spritesheet_parse_diagnostic_severity_string(
    value: SpritesheetParseDiagnosticSeverity,
) -> &'static str {
    return match value {
        SpritesheetParseDiagnosticSeverity::Error => "error",
        SpritesheetParseDiagnosticSeverity::Warning => "warning",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS SpritesheetValidationSeverity string union; the TS package exports no get_/parse_ free functions
pub fn get_spritesheet_validation_severity_string(
    value: SpritesheetValidationSeverity,
) -> &'static str {
    return match value {
        SpritesheetValidationSeverity::Error => "error",
        SpritesheetValidationSeverity::Warning => "warning",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS SpritesheetParseDiagnosticSeverity string union; the TS package exports no get_/parse_ free functions
pub fn parse_spritesheet_parse_diagnostic_severity(
    value: &str,
) -> Option<SpritesheetParseDiagnosticSeverity> {
    return match value {
        "error" => Some(SpritesheetParseDiagnosticSeverity::Error),
        "warning" => Some(SpritesheetParseDiagnosticSeverity::Warning),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS SpritesheetValidationSeverity string union; the TS package exports no get_/parse_ free functions
pub fn parse_spritesheet_validation_severity(value: &str) -> Option<SpritesheetValidationSeverity> {
    return match value {
        "error" => Some(SpritesheetValidationSeverity::Error),
        "warning" => Some(SpritesheetValidationSeverity::Warning),
        _ => None,
    };
}

/// Structural issues in a runtime sheet, or `None` when there are none: frames naming an atlas region
/// id the atlas lacks (errors, frame order), then per animation in property order an empty frame list
/// (a warning) and each frame reference outside the sheet's frames (errors).
// flight-lint: allow(f64) D1: animation frame references are JS numbers, printed with JS number formatting
pub fn validate_spritesheet(
    spritesheet: &Spritesheet,
) -> Option<Vec<SpritesheetValidationDiagnostic>> {
    let mut diagnostics = Vec::new();
    if let Some(atlas) = &spritesheet.atlas {
        let region_ids: HashSet<i32> = atlas
            .read()
            .unwrap()
            .regions
            .iter()
            .map(|region| region.read().unwrap().id)
            .collect();
        for (fi, frame) in spritesheet.frames.iter().enumerate() {
            let id = frame.read().unwrap().id;
            if !region_ids.contains(&id) {
                diagnostics.push(SpritesheetValidationDiagnostic {
                    animation_name: None,
                    frame_index: Some(fi),
                    message: format!("Frame {fi} references atlas region id {id} which does not exist in the atlas."),
                    severity: SpritesheetValidationSeverity::Error,
                });
            }
        }
    }
    let frame_count = spritesheet.frames.len();
    let mut pairs = Vec::new();
    entries(&mut pairs, &spritesheet.animations);
    for (name, animation) in pairs {
        let animation = animation.read().unwrap();
        if animation.frames.is_empty() {
            diagnostics.push(SpritesheetValidationDiagnostic {
                animation_name: Some(name.to_string()),
                frame_index: None,
                message: format!("Animation \"{name}\" has no frames."),
                severity: SpritesheetValidationSeverity::Warning,
            });
        }
        for (ai, frame_ref) in animation.frames.iter().enumerate() {
            if *frame_ref < 0.0 || *frame_ref >= frame_count as f64 {
                diagnostics.push(SpritesheetValidationDiagnostic {
                    animation_name: Some(name.to_string()),
                    frame_index: Some(ai),
                    message: format!(
                        "Animation \"{name}\" references frame index {} which is out of range (sheet has {frame_count} frames).",
                        unknown_to_js_string(&Some(Arc::new(*frame_ref)))
                    ),
                    severity: SpritesheetValidationSeverity::Error,
                });
            }
        }
    }
    return if diagnostics.is_empty() {
        None
    } else {
        Some(diagnostics)
    };
}

/// Structural issues in a sheet descriptor, or `None`: per animation, an empty frame-name list (a
/// warning), else each unknown frame name (errors) then a per-frame duration count differing from the
/// frame-name count (a warning).
pub fn validate_spritesheet_data(
    data: &SpritesheetData,
) -> Option<Vec<SpritesheetValidationDiagnostic>> {
    let mut diagnostics = Vec::new();
    let known_frame_names: HashSet<&str> = data
        .frames
        .iter()
        .filter(|fd| !fd.name.is_empty())
        .map(|fd| fd.name.as_str())
        .collect();
    for ad in &data.animations {
        if ad.frame_names.is_empty() {
            diagnostics.push(SpritesheetValidationDiagnostic {
                animation_name: Some(ad.name.clone()),
                frame_index: None,
                message: format!("Animation \"{}\" has no frameNames — all sheet frames will be used as the frame list.", ad.name),
                severity: SpritesheetValidationSeverity::Warning,
            });
            continue;
        }
        for (ai, fname) in ad.frame_names.iter().enumerate() {
            if !known_frame_names.contains(fname.as_str()) {
                diagnostics.push(SpritesheetValidationDiagnostic {
                    animation_name: Some(ad.name.clone()),
                    frame_index: Some(ai),
                    message: format!(
                        "Animation \"{}\" references frame name \"{fname}\" which is not present in the data frame list.",
                        ad.name
                    ),
                    severity: SpritesheetValidationSeverity::Error,
                });
            }
        }
        if let Some(durations) = &ad.frame_durations {
            if durations.len() != ad.frame_names.len() {
                diagnostics.push(SpritesheetValidationDiagnostic {
                    animation_name: Some(ad.name.clone()),
                    frame_index: None,
                    message: format!(
                        "Animation \"{}\" has {} frameDurations but {} frameNames — lengths should match.",
                        ad.name,
                        durations.len(),
                        ad.frame_names.len()
                    ),
                    severity: SpritesheetValidationSeverity::Warning,
                });
            }
        }
    }
    return if diagnostics.is_empty() {
        None
    } else {
        Some(diagnostics)
    };
}
