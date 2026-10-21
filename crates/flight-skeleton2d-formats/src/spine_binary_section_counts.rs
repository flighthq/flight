use std::collections::HashMap;

use flight_entity::Uint8Array;
use flight_importdiagnostics::{ImportDiagnostic, ImportDiagnosticDetailValue};
use flight_skeleton2d::contract::{
    SKELETON_2D_ANIMATION_TARGET_KIND_BONE, SKELETON_2D_ANIMATION_TARGET_KIND_SLOT,
    Skeleton2DAnimationTargetHandle,
};

use crate::spine_binary_full::parse_spine_skeleton_binary;
use crate::spine_binary_version::get_spine_binary_version;
use crate::types::*;

pub fn collect_spine_binary_section_counts(source: &Uint8Array) -> Option<HashMap<String, usize>> {
    let version = get_spine_binary_version(source)?;
    if !version.starts_with("4.1.") && version != "4.1" {
        return None;
    }
    let mut diagnostics = Vec::new();
    let parsed = parse_spine_skeleton_binary(source, Some(&mut diagnostics))?;
    let mut counts = HashMap::new();
    insert(
        &mut counts,
        SPINE_SECTION_KIND_BONES,
        parsed.skeleton.bones.len(),
    );
    insert(
        &mut counts,
        SPINE_SECTION_KIND_SLOTS,
        parsed.skeleton.slots.as_ref().map(Vec::len).unwrap_or(0),
    );
    insert(
        &mut counts,
        SPINE_SECTION_KIND_SKINS,
        parsed.skeleton.skins.as_ref().map(Vec::len).unwrap_or(0),
    );
    insert(
        &mut counts,
        SPINE_SECTION_KIND_ANIMATIONS,
        parsed.animations.len(),
    );
    for animation in &parsed.animations {
        for channel in &animation.clip.channels {
            let kind = channel
                .target_ref
                .as_ref()
                .and_then(|target| target.downcast_ref::<Skeleton2DAnimationTargetHandle>())
                .map(|target| target.kind.as_str());
            if kind == Some(SKELETON_2D_ANIMATION_TARGET_KIND_BONE) {
                increment(&mut counts, SPINE_TIMELINE_KIND_BONE, 1);
            } else if kind == Some(SKELETON_2D_ANIMATION_TARGET_KIND_SLOT) {
                increment(&mut counts, SPINE_TIMELINE_KIND_SLOT, 1);
            }
        }
        if animation.draw_order.is_some() {
            increment(&mut counts, SPINE_TIMELINE_KIND_DRAW_ORDER, 1);
        }
    }
    for diagnostic in &diagnostics {
        count_diagnostic(&mut counts, diagnostic);
    }
    return Some(counts);
}

fn count_diagnostic(counts: &mut HashMap<String, usize>, diagnostic: &ImportDiagnostic) {
    let mapping = match diagnostic.kind.as_str() {
        "spine.event-unsupported" => Some((SPINE_SECTION_KIND_EVENTS, "events")),
        "spine.ik-constraint-unsupported" => {
            Some((SPINE_SECTION_KIND_IK_CONSTRAINTS, "constraints"))
        }
        "spine.path-constraint-unsupported" => {
            Some((SPINE_SECTION_KIND_PATH_CONSTRAINTS, "constraints"))
        }
        "spine.transform-constraint-unsupported" => {
            Some((SPINE_SECTION_KIND_TRANSFORM_CONSTRAINTS, "constraints"))
        }
        "spine.ik-timeline-unsupported" => Some((SPINE_TIMELINE_KIND_IK, "timelines")),
        "spine.path-timeline-unsupported" => Some((SPINE_TIMELINE_KIND_PATH, "timelines")),
        "spine.transform-timeline-unsupported" => {
            Some((SPINE_TIMELINE_KIND_TRANSFORM, "timelines"))
        }
        "spine.deform-timeline-unsupported" | "spine.attachment-sequence-timeline-unsupported" => {
            Some((SPINE_TIMELINE_KIND_DEFORM, "timelines"))
        }
        "spine.event-timeline-unsupported" => Some((SPINE_TIMELINE_KIND_EVENT, "timelines")),
        _ => None,
    };
    let Some((kind, unit)) = mapping else {
        return;
    };
    let count = diagnostic
        .detail
        .as_ref()
        .and_then(|detail| detail.get(unit))
        .and_then(|value| match value {
            ImportDiagnosticDetailValue::Number(value) => Some(*value as usize),
            _ => None,
        })
        .unwrap_or(0);
    increment(counts, kind, count);
}

fn increment(counts: &mut HashMap<String, usize>, kind: &str, count: usize) {
    if count > 0 {
        *counts.entry(kind.to_string()).or_default() += count;
    }
}

fn insert(counts: &mut HashMap<String, usize>, kind: &str, count: usize) {
    if count > 0 {
        counts.insert(kind.to_string(), count);
    }
}
