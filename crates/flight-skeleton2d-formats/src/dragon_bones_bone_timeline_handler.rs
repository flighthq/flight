use std::sync::{Arc, RwLock};

use flight_animation::contract::{
    AnimationChannel, AnimationInterpolation, create_animation_channel, create_animation_track,
};
use flight_skeleton2d::contract::{
    SKELETON_2D_ANIMATION_PATH_ROTATION, SKELETON_2D_ANIMATION_PATH_SCALE,
    SKELETON_2D_ANIMATION_PATH_SHEAR, SKELETON_2D_ANIMATION_PATH_TRANSLATION,
    SKELETON_2D_ANIMATION_TARGET_KIND_BONE, create_skeleton_2d_animation_target_handle,
    create_skeleton_2d_bone_animation_target,
};
use serde_json::Value;

use crate::dragon_bones_parse_helpers::{
    build_dragon_bones_segment_easings, dragon_bones_frame_times, dragon_bones_frames,
    dragon_bones_interpolation, number_or, skip_crumb_dragon_bones_group,
};
use crate::types::{DragonBonesTimelineContext, JsonRecord};

fn add_rotate_channels(
    channels: &mut Vec<AnimationChannel>,
    raw: Option<&Value>,
    bone_index: i32,
    frame_rate: f32,
    diagnostics: Option<&mut Vec<flight_importdiagnostics::ImportDiagnostic>>,
) {
    let mut diagnostics = diagnostics;
    let frames = dragon_bones_frames(raw, diagnostics.as_deref_mut());
    if frames.is_empty() {
        return;
    }
    let mut times = Vec::new();
    dragon_bones_frame_times(&mut times, &frames, frame_rate);
    let interpolation = dragon_bones_interpolation(&frames, diagnostics);
    let mut rotations = Vec::new();
    let mut shears = Vec::new();
    let mut skewed = false;
    let mut previous_rotation = 0.0;
    let mut previous_clockwise = 0_i32;
    for (index, frame) in frames.iter().enumerate() {
        let mut rotation = number_or(frame.get("rotate"), 0.0);
        if times[index] != 0.0 {
            if previous_clockwise == 0 {
                rotation = previous_rotation + normalize_degrees(rotation - previous_rotation);
            } else {
                if (previous_clockwise > 0 && rotation >= previous_rotation)
                    || (previous_clockwise < 0 && rotation <= previous_rotation)
                {
                    previous_clockwise += if previous_clockwise > 0 { -1 } else { 1 };
                }
                rotation += 360.0 * previous_clockwise as f32;
            }
        }
        previous_clockwise = number_or(frame.get("clockwise"), 0.0) as i32;
        previous_rotation = rotation;
        let skew = number_or(frame.get("skew"), 0.0);
        skewed |= skew != 0.0;
        rotations.push(rotation);
        shears.extend([0.0, skew]);
    }
    let segment_easings = build_dragon_bones_segment_easings(&frames);
    push_bone_channel(
        channels,
        times.clone(),
        rotations,
        1,
        interpolation,
        bone_index,
        SKELETON_2D_ANIMATION_PATH_ROTATION,
        segment_easings.clone(),
    );
    if skewed {
        push_bone_channel(
            channels,
            times,
            shears,
            2,
            interpolation,
            bone_index,
            SKELETON_2D_ANIMATION_PATH_SHEAR,
            segment_easings,
        );
    }
}

fn add_vector_channel(
    channels: &mut Vec<AnimationChannel>,
    raw: Option<&Value>,
    bone_index: i32,
    path: &str,
    frame_rate: f32,
    scale: bool,
    diagnostics: Option<&mut Vec<flight_importdiagnostics::ImportDiagnostic>>,
) {
    let mut diagnostics = diagnostics;
    let frames = dragon_bones_frames(raw, diagnostics.as_deref_mut());
    if frames.is_empty() {
        return;
    }
    let fallback = if scale { 1.0 } else { 0.0 };
    let values = frames
        .iter()
        .flat_map(|frame| {
            [
                number_or(frame.get("x"), fallback),
                number_or(frame.get("y"), fallback),
            ]
        })
        .collect();
    let mut times = Vec::new();
    dragon_bones_frame_times(&mut times, &frames, frame_rate);
    let interpolation = dragon_bones_interpolation(&frames, diagnostics);
    let segment_easings = build_dragon_bones_segment_easings(&frames);
    push_bone_channel(
        channels,
        times,
        values,
        2,
        interpolation,
        bone_index,
        path,
        segment_easings,
    );
}

pub fn dragon_bones_bone_timeline_handler(
    context: &mut DragonBonesTimelineContext<'_, '_>,
    _anim_name: &str,
    anim_entry: &JsonRecord,
) {
    let Some(timelines) = anim_entry.get("bone").and_then(Value::as_array) else {
        return;
    };
    for timeline in timelines.iter().filter_map(Value::as_object) {
        let bone_index = timeline
            .get("name")
            .and_then(Value::as_str)
            .and_then(|name| context.section.bone_index_by_name.get(name))
            .map(|index| *index as i32)
            .unwrap_or(-1);
        if bone_index < 0 {
            context.unresolved_bone_count += 1;
            continue;
        }
        add_vector_channel(
            &mut context.channels,
            timeline.get("translateFrame"),
            bone_index,
            SKELETON_2D_ANIMATION_PATH_TRANSLATION,
            context.section.frame_rate,
            false,
            context.section.diagnostics.as_deref_mut(),
        );
        add_rotate_channels(
            &mut context.channels,
            timeline.get("rotateFrame"),
            bone_index,
            context.section.frame_rate,
            context.section.diagnostics.as_deref_mut(),
        );
        add_vector_channel(
            &mut context.channels,
            timeline.get("scaleFrame"),
            bone_index,
            SKELETON_2D_ANIMATION_PATH_SCALE,
            context.section.frame_rate,
            true,
            context.section.diagnostics.as_deref_mut(),
        );
        skip_crumb_dragon_bones_group(
            context.section.diagnostics.as_deref_mut(),
            timeline.get("frame"),
            "dragonbones.legacy-bone-frame-unsupported",
        );
    }
}

fn normalize_degrees(degrees: f32) -> f32 {
    let wrapped = (degrees + 180.0) % 360.0;
    return wrapped + if wrapped > 0.0 { -180.0 } else { 180.0 };
}

fn push_bone_channel(
    channels: &mut Vec<AnimationChannel>,
    times: Vec<f32>,
    values: Vec<f32>,
    components: usize,
    interpolation: AnimationInterpolation,
    bone_index: i32,
    path: &str,
    segment_easings: Option<Vec<Option<flight_animation::EasingFn>>>,
) {
    let track = Arc::new(RwLock::new({
        let mut track = create_animation_track();
        track.times = times;
        track.values = values;
        track.components = components;
        track.interpolation = interpolation;
        track.segment_easings = segment_easings;
        track
    }));
    let target = create_skeleton_2d_bone_animation_target(bone_index, path);
    let handle = create_skeleton_2d_animation_target_handle(
        SKELETON_2D_ANIMATION_TARGET_KIND_BONE,
        Some(Arc::new(target)),
    );
    channels.push(create_animation_channel(&track, Some(Arc::new(handle))));
}
