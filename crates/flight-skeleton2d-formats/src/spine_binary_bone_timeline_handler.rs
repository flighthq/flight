use std::sync::{Arc, RwLock};

use flight_animation::contract::{
    AnimationInterpolation, CreateAnimationTrackOpts, create_animation_channel,
    create_animation_track,
};
use flight_easing::contract::ease_cubic_bezier;
use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_skeleton2d::contract::{
    SKELETON_2D_ANIMATION_PATH_ROTATION, SKELETON_2D_ANIMATION_PATH_SCALE,
    SKELETON_2D_ANIMATION_PATH_SCALE_X, SKELETON_2D_ANIMATION_PATH_SCALE_Y,
    SKELETON_2D_ANIMATION_PATH_SHEAR, SKELETON_2D_ANIMATION_PATH_SHEAR_X,
    SKELETON_2D_ANIMATION_PATH_SHEAR_Y, SKELETON_2D_ANIMATION_PATH_TRANSLATION,
    SKELETON_2D_ANIMATION_PATH_TRANSLATION_X, SKELETON_2D_ANIMATION_PATH_TRANSLATION_Y,
    SKELETON_2D_ANIMATION_TARGET_KIND_BONE, create_skeleton_2d_animation_target_handle,
    create_skeleton_2d_bone_animation_target,
};

use crate::spine_binary_parse_helpers::{
    SPINE_BINARY_CURVE_BEZIER, SPINE_BINARY_CURVE_EPSILON, clamp_spine_binary_unit,
    skip_spine_binary_curve_frames, tally,
};
use crate::spine_binary_reader::*;
use crate::types::{ByteReader, SPINE_TIMELINE_KIND_BONE, SpineBinaryTimelineContext};

pub struct SpineBinaryValueTimeline {
    pub curves: Vec<Option<Vec<f32>>>,
    pub times: Vec<f32>,
    pub values: Vec<f32>,
}

pub fn build_spine_binary_segment_easings(
    timeline: &SpineBinaryValueTimeline,
    values: usize,
    diagnostics: Option<&mut Vec<flight_importdiagnostics::ImportDiagnostic>>,
) -> Option<Vec<Option<flight_animation::EasingFn>>> {
    let mut easings = Vec::with_capacity(timeline.curves.len());
    let mut curved = false;
    let mut divergent = 0;
    for (index, points) in timeline.curves.iter().enumerate() {
        let Some(points) = points else {
            easings.push(None);
            continue;
        };
        let Some((&from_time, &to_time)) =
            timeline.times.get(index).zip(timeline.times.get(index + 1))
        else {
            easings.push(None);
            continue;
        };
        let span = to_time - from_time;
        if span <= 0.0 {
            easings.push(None);
            continue;
        }
        let mut winner = None;
        let mut widest = 0.0;
        for component in 0..values.min(points.len() / 4) {
            let from_index = index * values + component;
            let to_index = (index + 1) * values + component;
            let Some((&from, &to)) = timeline
                .values
                .get(from_index)
                .zip(timeline.values.get(to_index))
            else {
                continue;
            };
            let rise = (to - from).abs();
            if rise > widest {
                widest = rise;
                winner = Some(component);
            }
        }
        let rebase = |component: usize| -> Option<[f32; 4]> {
            let from = *timeline.values.get(index * values + component)?;
            let rise = *timeline.values.get((index + 1) * values + component)? - from;
            if rise == 0.0 {
                return None;
            }
            let offset = component * 4;
            Some([
                (points[offset] - from_time) / span,
                (points[offset + 1] - from) / rise,
                (points[offset + 2] - from_time) / span,
                (points[offset + 3] - from) / rise,
            ])
        };
        let won = winner.and_then(rebase);
        if let Some(won) = won {
            for component in 0..values.min(points.len() / 4) {
                if Some(component) == winner {
                    continue;
                }
                let Some(other) = rebase(component) else {
                    continue;
                };
                divergent += other
                    .iter()
                    .zip(won)
                    .filter(|(other, won)| (*other - won).abs() > SPINE_BINARY_CURVE_EPSILON)
                    .count();
            }
            curved = true;
            easings.push(Some(ease_cubic_bezier(
                clamp_spine_binary_unit(won[0]),
                won[1],
                clamp_spine_binary_unit(won[2]),
                won[3],
            )));
        } else {
            easings.push(None);
        }
    }
    if divergent > 0 {
        let mut detail = std::collections::HashMap::new();
        detail.insert(
            "segments".to_string(),
            ImportDiagnosticDetailValue::Number(divergent as f32),
        );
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Skip,
            "spine.per-component-curve-easing-unsupported",
            "buildSpineBinarySegmentEasings",
            Some(detail),
        );
    }
    return curved.then_some(easings);
}

fn consume_bone_timelines(context: &mut SpineBinaryTimelineContext<'_, '_>, retain: bool) {
    let bones = read_spine_binary_varint(&mut context.section.reader) as usize;
    for _ in 0..bones {
        if is_spine_binary_reader_overrun(&context.section.reader) {
            break;
        }
        let bone_index = read_spine_binary_varint(&mut context.section.reader) as i32;
        let timeline_count = read_spine_binary_varint(&mut context.section.reader) as usize;
        for _ in 0..timeline_count {
            if !retain {
                tally(
                    &mut context.unregistered_timeline_counts,
                    SPINE_TIMELINE_KIND_BONE,
                );
            }
            let ordinal = read_spine_binary_byte(&mut context.section.reader) as usize;
            let frame_count = read_spine_binary_varint(&mut context.section.reader) as usize;
            read_spine_binary_varint(&mut context.section.reader);
            let Some((path, components)) = BONE_TIMELINES.get(ordinal).copied() else {
                let overrun = context.section.reader.view.len().saturating_add(1);
                skip_spine_binary_bytes(&mut context.section.reader, overrun);
                return;
            };
            if !retain {
                skip_spine_binary_curve_frames(
                    &mut context.section.reader,
                    frame_count,
                    components * 4,
                    components,
                );
                continue;
            }
            let timeline =
                read_value_timeline(&mut context.section.reader, frame_count, components);
            let segment_easings = build_spine_binary_segment_easings(
                &timeline,
                components,
                context.section.diagnostics.as_deref_mut(),
            );
            let track = Arc::new(RwLock::new(create_animation_track(
                CreateAnimationTrackOpts {
                    components: Some(components),
                    interpolation: Some(AnimationInterpolation::Linear),
                    segment_easings,
                    times: timeline.times,
                    values: timeline.values,
                    ..Default::default()
                },
            )));
            let target = create_skeleton_2d_bone_animation_target(bone_index, path);
            let handle = create_skeleton_2d_animation_target_handle(
                SKELETON_2D_ANIMATION_TARGET_KIND_BONE,
                Some(Arc::new(target)),
            );
            context
                .channels
                .push(create_animation_channel(&track, Some(Arc::new(handle))));
        }
    }
}

fn read_value_timeline(
    reader: &mut ByteReader<'_>,
    frame_count: usize,
    components: usize,
) -> SpineBinaryValueTimeline {
    let mut output = SpineBinaryValueTimeline {
        curves: Vec::new(),
        times: Vec::new(),
        values: Vec::new(),
    };
    if frame_count == 0 {
        return output;
    }
    output.times.push(read_spine_binary_float(reader));
    for _ in 0..components {
        output.values.push(read_spine_binary_float(reader));
    }
    for _ in 0..frame_count.saturating_sub(1) {
        if is_spine_binary_reader_overrun(reader) {
            break;
        }
        output.times.push(read_spine_binary_float(reader));
        for _ in 0..components {
            output.values.push(read_spine_binary_float(reader));
        }
        if read_spine_binary_byte(reader) == SPINE_BINARY_CURVE_BEZIER {
            output.curves.push(Some(
                (0..components * 4)
                    .map(|_| read_spine_binary_float(reader))
                    .collect(),
            ));
        } else {
            output.curves.push(None);
        }
    }
    return output;
}

pub fn skip_spine_binary_bone_timelines(context: &mut SpineBinaryTimelineContext<'_, '_>) {
    consume_bone_timelines(context, false);
}

pub fn spine_binary_bone_timeline_handler(context: &mut SpineBinaryTimelineContext<'_, '_>) {
    consume_bone_timelines(context, true);
}

const BONE_TIMELINES: [(&str, usize); 10] = [
    (SKELETON_2D_ANIMATION_PATH_ROTATION, 1),
    (SKELETON_2D_ANIMATION_PATH_TRANSLATION, 2),
    (SKELETON_2D_ANIMATION_PATH_TRANSLATION_X, 1),
    (SKELETON_2D_ANIMATION_PATH_TRANSLATION_Y, 1),
    (SKELETON_2D_ANIMATION_PATH_SCALE, 2),
    (SKELETON_2D_ANIMATION_PATH_SCALE_X, 1),
    (SKELETON_2D_ANIMATION_PATH_SCALE_Y, 1),
    (SKELETON_2D_ANIMATION_PATH_SHEAR, 2),
    (SKELETON_2D_ANIMATION_PATH_SHEAR_X, 1),
    (SKELETON_2D_ANIMATION_PATH_SHEAR_Y, 1),
];
