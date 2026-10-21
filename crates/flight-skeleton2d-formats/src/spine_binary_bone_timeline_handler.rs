use std::sync::Arc;

use flight_animation::contract::{
    AnimationInterpolation, CreateAnimationTrackOpts, create_animation_channel,
    create_animation_track,
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
    SPINE_BINARY_CURVE_BEZIER, skip_spine_binary_curve_frames, tally,
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
    let _ = (timeline, values, diagnostics);
    return None;
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
            let track = create_animation_track(CreateAnimationTrackOpts {
                components: Some(components),
                interpolation: Some(AnimationInterpolation::Linear),
                times: timeline.times,
                values: timeline.values,
                ..Default::default()
            });
            let target = create_skeleton_2d_bone_animation_target(bone_index, path);
            let handle = create_skeleton_2d_animation_target_handle(
                SKELETON_2D_ANIMATION_TARGET_KIND_BONE,
                Some(Arc::new(target)),
            );
            context
                .channels
                .push(create_animation_channel(track, Some(Arc::new(handle))));
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
