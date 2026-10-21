use std::collections::HashMap;

use flight_animation::contract::create_animation_clip;
use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};
use serde_json::Value;

use crate::spine_json_registry::get_spine_json_timeline_handler;
use crate::types::{
    SPINE_TIMELINE_KIND_BONE, SPINE_TIMELINE_KIND_DEFORM, SPINE_TIMELINE_KIND_DRAW_ORDER,
    SPINE_TIMELINE_KIND_EVENT, SPINE_TIMELINE_KIND_IK, SPINE_TIMELINE_KIND_PATH,
    SPINE_TIMELINE_KIND_SLOT, SPINE_TIMELINE_KIND_TRANSFORM, Skeleton2DImportAnimation,
    SpineJsonSectionContext, SpineJsonTimelineContext, sorted_count_entries,
};

pub fn spine_json_animations_section_handler(context: &mut SpineJsonSectionContext<'_>) {
    let Some(animations) = context.doc.get("animations").and_then(Value::as_object) else {
        return;
    };
    for (name, value) in animations {
        let Some(animation) = value.as_object() else {
            continue;
        };
        let mut timeline = SpineJsonTimelineContext {
            channels: Vec::new(),
            draw_order: None,
            section: context,
            unregistered_timeline_counts: HashMap::new(),
            unmodeled_timeline_counts: HashMap::new(),
        };
        for (json_key, kind) in [
            ("bones", SPINE_TIMELINE_KIND_BONE),
            ("slots", SPINE_TIMELINE_KIND_SLOT),
            ("deform", SPINE_TIMELINE_KIND_DEFORM),
            ("drawOrder", SPINE_TIMELINE_KIND_DRAW_ORDER),
            ("draworder", SPINE_TIMELINE_KIND_DRAW_ORDER),
            ("events", SPINE_TIMELINE_KIND_EVENT),
            ("ik", SPINE_TIMELINE_KIND_IK),
            ("path", SPINE_TIMELINE_KIND_PATH),
            ("transform", SPINE_TIMELINE_KIND_TRANSFORM),
        ] {
            if !animation.contains_key(json_key) {
                continue;
            }
            if let Some(handler) = get_spine_json_timeline_handler(timeline.section.registry, kind)
            {
                handler(&mut timeline, name, animation);
            } else {
                *timeline
                    .unregistered_timeline_counts
                    .entry(kind.to_string())
                    .or_default() += 1;
            }
        }
        for (kind, count) in sorted_count_entries(&timeline.unregistered_timeline_counts) {
            let mut detail = HashMap::new();
            detail.insert(
                "count".to_string(),
                ImportDiagnosticDetailValue::Number(count as f32),
            );
            report_import_diagnostic(
                timeline.section.diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Skip,
                &format!("spine.{kind}-timeline-unregistered"),
                "spineJsonAnimationsSectionReader",
                Some(detail),
            );
        }
        let channels = std::mem::take(&mut timeline.channels);
        let draw_order = timeline.draw_order.take();
        timeline.section.animations.push(Skeleton2DImportAnimation {
            clip: create_animation_clip(channels, None, &[]),
            draw_order,
            name: name.clone(),
        });
    }
}
