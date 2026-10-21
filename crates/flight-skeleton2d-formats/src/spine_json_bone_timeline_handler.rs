use std::sync::{Arc, RwLock};

use flight_animation::contract::{
    AnimationChannel, AnimationInterpolation, CreateAnimationTrackOpts, create_animation_channel,
    create_animation_track,
};
use flight_importdiagnostics::ImportDiagnostic;
use flight_skeleton2d::contract::{
    SKELETON_2D_ANIMATION_PATH_ROTATION, SKELETON_2D_ANIMATION_PATH_SCALE,
    SKELETON_2D_ANIMATION_PATH_SCALE_X, SKELETON_2D_ANIMATION_PATH_SCALE_Y,
    SKELETON_2D_ANIMATION_PATH_SHEAR, SKELETON_2D_ANIMATION_PATH_SHEAR_X,
    SKELETON_2D_ANIMATION_PATH_SHEAR_Y, SKELETON_2D_ANIMATION_PATH_TRANSLATION,
    SKELETON_2D_ANIMATION_PATH_TRANSLATION_X, SKELETON_2D_ANIMATION_PATH_TRANSLATION_Y,
    SKELETON_2D_ANIMATION_TARGET_KIND_BONE, create_skeleton_2d_animation_target_handle,
    create_skeleton_2d_bone_animation_target,
};
use serde_json::Value;

use crate::spine_parse_helpers::{build_spine_segment_easings, index_of_bone, number_or};
use crate::types::{JsonRecord, SpineJsonTimelineContext};

fn add_spine_bone_channel(
    channels: &mut Vec<AnimationChannel>,
    raw: Option<&Value>,
    bone_index: i32,
    path: &str,
    components: usize,
    fields: &[&str],
    defaults: &[f32],
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) {
    let Some(raw_keys) = raw
        .and_then(Value::as_array)
        .filter(|keys| !keys.is_empty())
    else {
        return;
    };
    let mut times = Vec::new();
    let mut values = Vec::new();
    let mut keys = Vec::new();
    let mut all_stepped = true;
    for key in raw_keys.iter().filter_map(Value::as_object) {
        keys.push(key);
        times.push(number_or(key.get("time"), 0.0));
        for component in 0..components {
            values.push(number_or(key.get(fields[component]), defaults[component]));
        }
        if key.get("curve").and_then(Value::as_str) != Some("stepped") {
            all_stepped = false;
        }
    }
    if times.is_empty() {
        return;
    }
    let segment_easings =
        build_spine_segment_easings(&keys, &times, &values, components, diagnostics);
    let track = Arc::new(RwLock::new(create_animation_track(
        CreateAnimationTrackOpts {
            components: Some(components),
            interpolation: Some(if all_stepped {
                AnimationInterpolation::Step
            } else {
                AnimationInterpolation::Linear
            }),
            segment_easings,
            times,
            values,
            ..Default::default()
        },
    )));
    let target = create_skeleton_2d_bone_animation_target(bone_index, path);
    let handle = create_skeleton_2d_animation_target_handle(
        SKELETON_2D_ANIMATION_TARGET_KIND_BONE,
        Some(Arc::new(target)),
    );
    channels.push(create_animation_channel(&track, Some(Arc::new(handle))));
}

pub fn spine_json_bone_timeline_handler(
    context: &mut SpineJsonTimelineContext<'_, '_>,
    _animation_name: &str,
    animation: &JsonRecord,
) {
    let Some(bones) = animation.get("bones").and_then(Value::as_object) else {
        return;
    };
    for (bone_name, value) in bones {
        let bone_index = index_of_bone(&context.section.bones, bone_name);
        let Some(timelines) = value.as_object().filter(|_| bone_index >= 0) else {
            continue;
        };
        add_spine_bone_channel(
            &mut context.channels,
            timelines.get("rotate"),
            bone_index,
            SKELETON_2D_ANIMATION_PATH_ROTATION,
            1,
            &["value"],
            &[0.0],
            context.section.diagnostics.as_deref_mut(),
        );
        add_spine_bone_channel(
            &mut context.channels,
            timelines.get("translate"),
            bone_index,
            SKELETON_2D_ANIMATION_PATH_TRANSLATION,
            2,
            &["x", "y"],
            &[0.0, 0.0],
            context.section.diagnostics.as_deref_mut(),
        );
        add_spine_bone_channel(
            &mut context.channels,
            timelines.get("scale"),
            bone_index,
            SKELETON_2D_ANIMATION_PATH_SCALE,
            2,
            &["x", "y"],
            &[1.0, 1.0],
            context.section.diagnostics.as_deref_mut(),
        );
        add_spine_bone_channel(
            &mut context.channels,
            timelines.get("shear"),
            bone_index,
            SKELETON_2D_ANIMATION_PATH_SHEAR,
            2,
            &["x", "y"],
            &[0.0, 0.0],
            context.section.diagnostics.as_deref_mut(),
        );
        for (key, path, identity) in [
            ("translatex", SKELETON_2D_ANIMATION_PATH_TRANSLATION_X, 0.0),
            ("translatey", SKELETON_2D_ANIMATION_PATH_TRANSLATION_Y, 0.0),
            ("scalex", SKELETON_2D_ANIMATION_PATH_SCALE_X, 1.0),
            ("scaley", SKELETON_2D_ANIMATION_PATH_SCALE_Y, 1.0),
            ("shearx", SKELETON_2D_ANIMATION_PATH_SHEAR_X, 0.0),
            ("sheary", SKELETON_2D_ANIMATION_PATH_SHEAR_Y, 0.0),
        ] {
            add_spine_bone_channel(
                &mut context.channels,
                timelines.get(key),
                bone_index,
                path,
                1,
                &["value"],
                &[identity],
                context.section.diagnostics.as_deref_mut(),
            );
        }
    }
}
