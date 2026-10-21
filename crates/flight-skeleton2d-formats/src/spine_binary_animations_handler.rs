use std::collections::HashMap;

use flight_animation::contract::create_animation_clip;
use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};

use crate::spine_binary_bone_timeline_handler::skip_spine_binary_bone_timelines;
use crate::spine_binary_draw_order_timeline_handler::skip_spine_binary_draw_order_timeline;
use crate::spine_binary_reader::*;
use crate::spine_binary_registry::get_spine_binary_timeline_handler;
use crate::spine_binary_slot_timeline_handler::skip_spine_binary_slot_timelines;
use crate::spine_binary_stub_timeline_handlers::*;
use crate::types::*;

fn consume_animations(context: &mut SpineBinarySectionContext<'_>, retain: bool) {
    let count = read_spine_binary_varint(&mut context.reader) as usize;
    let mut total_unmodeled: HashMap<String, usize> = HashMap::new();
    let mut total_unregistered: HashMap<String, usize> = HashMap::new();
    for _ in 0..count {
        if is_spine_binary_reader_overrun(&context.reader) {
            break;
        }
        let name = read_spine_binary_string(&mut context.reader).unwrap_or_default();
        read_spine_binary_varint(&mut context.reader);
        let mut timeline = SpineBinaryTimelineContext {
            channels: Vec::new(),
            draw_order: None,
            section: context,
            unregistered_timeline_counts: HashMap::new(),
            unmodeled_timeline_counts: HashMap::new(),
        };
        dispatch(
            &mut timeline,
            SPINE_TIMELINE_KIND_SLOT,
            retain,
            skip_spine_binary_slot_timelines,
        );
        dispatch(
            &mut timeline,
            SPINE_TIMELINE_KIND_BONE,
            retain,
            skip_spine_binary_bone_timelines,
        );
        dispatch(
            &mut timeline,
            SPINE_TIMELINE_KIND_IK,
            retain,
            skip_spine_binary_ik_timelines,
        );
        dispatch(
            &mut timeline,
            SPINE_TIMELINE_KIND_TRANSFORM,
            retain,
            skip_spine_binary_transform_timelines,
        );
        dispatch(
            &mut timeline,
            SPINE_TIMELINE_KIND_PATH,
            retain,
            skip_spine_binary_path_timelines,
        );
        dispatch(
            &mut timeline,
            SPINE_TIMELINE_KIND_DEFORM,
            retain,
            skip_spine_binary_deform_timelines,
        );
        dispatch(
            &mut timeline,
            SPINE_TIMELINE_KIND_DRAW_ORDER,
            retain,
            skip_spine_binary_draw_order_timeline,
        );
        dispatch(
            &mut timeline,
            SPINE_TIMELINE_KIND_EVENT,
            retain,
            skip_spine_binary_event_timelines,
        );
        for (kind, value) in sorted_count_entries(&timeline.unmodeled_timeline_counts) {
            *total_unmodeled.entry(kind).or_default() += value;
        }
        for (kind, value) in sorted_count_entries(&timeline.unregistered_timeline_counts) {
            *total_unregistered.entry(kind).or_default() += value;
        }
        if retain {
            let channels = std::mem::take(&mut timeline.channels);
            let draw_order = timeline.draw_order.take();
            timeline.section.animations.push(Skeleton2DImportAnimation {
                clip: create_animation_clip(channels, None, &[]),
                draw_order,
                name,
            });
        }
    }
    if retain {
        for (kind, count) in sorted_count_entries(&total_unmodeled) {
            report(
                context,
                &format!("spine.{kind}-timeline-unsupported"),
                "parseSpineSkeletonBinary",
                "timelines",
                count,
                None,
            );
        }
        for (kind, count) in sorted_count_entries(&total_unregistered) {
            report(
                context,
                "spine.binary-timeline-unregistered",
                "parseSpineSkeletonBinaryWithRegistry",
                "timelines",
                count,
                Some(kind),
            );
        }
    }
}

fn dispatch(
    context: &mut SpineBinaryTimelineContext<'_, '_>,
    kind: &str,
    retain: bool,
    skip: for<'a, 'b> fn(&mut SpineBinaryTimelineContext<'a, 'b>),
) {
    if retain {
        if let Some(handler) = get_spine_binary_timeline_handler(context.section.registry, kind) {
            handler(context);
        } else {
            skip(context);
        }
    } else {
        skip(context);
    }
}

fn report(
    context: &mut SpineBinarySectionContext<'_>,
    kind: &str,
    origin: &str,
    unit: &str,
    count: usize,
    timeline: Option<String>,
) {
    let mut detail = HashMap::new();
    detail.insert(
        unit.to_string(),
        ImportDiagnosticDetailValue::Number(count as f32),
    );
    if let Some(timeline) = timeline {
        detail.insert(
            "timeline".to_string(),
            ImportDiagnosticDetailValue::String(timeline),
        );
    }
    report_import_diagnostic(
        context.diagnostics.as_deref_mut(),
        ImportDiagnosticSeverity::Skip,
        kind,
        origin,
        Some(detail),
    );
}

pub fn skip_spine_binary_animations_section(context: &mut SpineBinarySectionContext<'_>) {
    consume_animations(context, false);
}

pub fn spine_binary_animations_section_handler(context: &mut SpineBinarySectionContext<'_>) {
    consume_animations(context, true);
}
