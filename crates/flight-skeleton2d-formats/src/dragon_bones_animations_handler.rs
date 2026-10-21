use std::collections::HashMap;

use flight_animation::contract::create_animation_clip;
use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};
use serde_json::Value;

use crate::dragon_bones_parse_helpers::number_or;
use crate::dragon_bones_registry::get_dragon_bones_timeline_handler;
use crate::types::*;

pub fn dragon_bones_animations_section_handler(context: &mut DragonBonesSectionContext<'_>) {
    let Some(animations) = context.armature.get("animation").and_then(Value::as_array) else {
        return;
    };
    let mut blend_trees = 0;
    let mut total_unresolved_bones = 0;
    let mut total_unmodeled: HashMap<String, usize> = HashMap::new();
    for animation in animations
        .iter()
        .filter_map(Value::as_object)
        .cloned()
        .map(JsonRecord::from)
    {
        if animation.get("type").and_then(Value::as_str) == Some("tree") {
            blend_trees += 1;
        }
        let name = animation
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("default")
            .to_string();
        let mut timeline = DragonBonesTimelineContext {
            channels: Vec::new(),
            section: context,
            unmodeled_timeline_counts: HashMap::new(),
            unresolved_bone_count: 0,
            unregistered_timeline_counts: HashMap::new(),
        };
        for (json_key, kind) in [
            ("bone", DRAGON_BONES_TIMELINE_KIND_BONE),
            ("slot", DRAGON_BONES_TIMELINE_KIND_SLOT),
            ("ffd", DRAGON_BONES_TIMELINE_KIND_DEFORM),
            ("ik", DRAGON_BONES_TIMELINE_KIND_IK),
            ("zOrder", DRAGON_BONES_TIMELINE_KIND_Z_ORDER),
        ] {
            if !animation.contains_key(json_key) {
                continue;
            }
            if let Some(handler) =
                get_dragon_bones_timeline_handler(timeline.section.registry, kind)
            {
                handler(&mut timeline, &name, &animation);
            } else {
                *timeline
                    .unregistered_timeline_counts
                    .entry(kind.to_string())
                    .or_default() += 1;
            }
        }
        for (kind, count) in sorted_count_entries(&timeline.unregistered_timeline_counts) {
            report_count(
                timeline.section.diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Skip,
                &format!("dragonbones.{kind}-timeline-unregistered"),
                "dragonBonesAnimationsSectionReader",
                "count",
                count,
            );
        }
        total_unresolved_bones += timeline.unresolved_bone_count;
        for (kind, count) in sorted_count_entries(&timeline.unmodeled_timeline_counts) {
            *total_unmodeled.entry(kind).or_default() += count;
        }
        let duration = number_or(animation.get("duration"), 0.0) / timeline.section.frame_rate;
        let channels = std::mem::take(&mut timeline.channels);
        timeline.section.animations.push(Skeleton2DImportAnimation {
            clip: create_animation_clip(
                channels,
                (duration.is_finite() && duration > 0.0).then_some(duration),
                &[],
            ),
            draw_order: None,
            name,
        });
    }
    if blend_trees > 0 {
        report_count(
            context.diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Skip,
            "dragonbones.blend-tree-animation-unsupported",
            "parseDragonBonesSkeleton",
            "animations",
            blend_trees,
        );
    }
    for (kind, count) in sorted_count_entries(&total_unmodeled) {
        report_count(
            context.diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Skip,
            &format!("dragonbones.{kind}-timeline-unsupported"),
            "parseDragonBonesSkeleton",
            "timelines",
            count,
        );
    }
    if total_unresolved_bones > 0 {
        report_count(
            context.diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Recover,
            "dragonbones.animation-bone-unresolved",
            "parseDragonBonesSkeleton",
            "bones",
            total_unresolved_bones,
        );
    }
}

fn report_count(
    diagnostics: Option<&mut Vec<flight_importdiagnostics::ImportDiagnostic>>,
    severity: ImportDiagnosticSeverity,
    kind: &str,
    origin: &str,
    key: &str,
    count: usize,
) {
    let mut detail = HashMap::new();
    detail.insert(
        key.to_string(),
        ImportDiagnosticDetailValue::Number(count as f32),
    );
    report_import_diagnostic(diagnostics, severity, kind, origin, Some(detail));
}
