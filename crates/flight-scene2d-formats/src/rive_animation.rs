use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_animation::{
    create_animation_channel, create_animation_clip, create_animation_track,
    sample_animation_track, AnimationChannel, AnimationInterpolation, CreateAnimationTrackOpts,
    EasingFn,
};
use flight_easing::{
    ease_cubic_bezier, ease_in_damped_sine, ease_in_out_damped_sine, ease_out_damped_sine,
};
use flight_importdiagnostics::{
    report_import_diagnostic, ImportDiagnostic, ImportDiagnosticDetailValue,
    ImportDiagnosticSeverity,
};
use flight_math::RAD_TO_DEG;
use flight_scene2d::{
    apply_animation_clip_to_node2d, Node2DAnimationPath, Node2DAnimationTarget, Node2DRef,
};
use flight_skeleton2d::contract::{
    create_skeleton_2d_animation_target_handle, create_skeleton_2d_bone_animation_target, Bone2D,
    SKELETON_2D_ANIMATION_PATH_ROTATION, SKELETON_2D_ANIMATION_PATH_SCALE_X,
    SKELETON_2D_ANIMATION_PATH_SCALE_Y, SKELETON_2D_ANIMATION_PATH_TRANSLATION_X,
    SKELETON_2D_ANIMATION_PATH_TRANSLATION_Y, SKELETON_2D_ANIMATION_TARGET_KIND_BONE,
};

use crate::rive_core_types::is_rive_core_type_derived_from;
use crate::rive_import_registry::register_rive_core_object_handler;
use crate::types::*;

// Format-owned animation targets write through the shared artboard snapshot used by shape rebuilds.
#[derive(Clone)]
struct RiveMutableTarget {
    artboard: Arc<RwLock<RiveArtboardGraph>>,
    default_type: RiveFieldType,
    object_index: usize,
    property_key: u64,
    rebuild: RiveRebuild,
}

fn create_rive_animation_clip(
    objects: &[RiveCoreObject],
    start: usize,
    limit: usize,
    nodes: &[Option<Node2DRef>],
    interpolators: &HashMap<usize, EasingFn>,
    artboard: Arc<RwLock<RiveArtboardGraph>>,
    rebuilds: &HashMap<usize, RiveRebuild>,
    skeleton: Option<&RiveSkeleton2DImport>,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> RiveAnimationClip {
    let source = &objects[start];
    let fps = read_rive_number(source, RIVE_ANIMATION_FPS, 60.0).max(1.0);
    let mut channels = Vec::new();
    let mut keyed = None::<Node2DRef>;
    let mut keyed_index = -1_i32;
    let mut run_properties = 0_usize;
    let mut run_channels = 0_usize;
    let mut run_diagnostics = diagnostic_count(&diagnostics);

    for index in start + 1..limit {
        let object = &objects[index];
        if object.type_key == RIVE_LINEAR_ANIMATION {
            break;
        }
        if object.type_key == RIVE_KEYED_OBJECT {
            close_keyed_run(
                &channels,
                keyed_index,
                run_properties,
                run_channels,
                run_diagnostics,
                diagnostics.as_deref_mut(),
            );
            run_properties = 0;
            run_channels = channels.len();
            run_diagnostics = diagnostic_count(&diagnostics);
            keyed_index = read_rive_number(object, RIVE_KEYED_OBJECT_ID, -1.0) as i32;
            keyed = usize::try_from(keyed_index)
                .ok()
                .and_then(|index| nodes.get(index))
                .cloned()
                .flatten();
            continue;
        }
        if object.type_key != RIVE_KEYED_PROPERTY {
            continue;
        }
        let first_keyframe = objects.get(index + 1);
        if first_keyframe.is_some_and(|object| is_rive_type(object.type_key, RIVE_KEYFRAME)) {
            run_properties += 1;
        }
        let property_key = read_rive_number(object, RIVE_KEYED_PROPERTY_KEY, -1.0) as i64;
        if let Some(channel) = create_rive_bone_channel(
            objects,
            index,
            limit,
            fps,
            interpolators,
            skeleton,
            keyed_index,
            property_key,
            diagnostics.as_deref_mut(),
        ) {
            channels.push(channel);
            continue;
        }
        if let Some(path) = to_rive_animation_path(property_key) {
            if let Some(node) = keyed.clone() {
                if let Some(channel) = create_rive_channel(
                    objects,
                    index,
                    limit,
                    fps,
                    interpolators,
                    to_rive_value_conversion(path),
                    Some(Arc::new(Node2DAnimationTarget { node, path })),
                    diagnostics.as_deref_mut(),
                ) {
                    channels.push(channel);
                }
            }
            continue;
        }
        let keyframe_type = first_keyframe.map(|object| object.type_key);
        if !matches!(
            keyframe_type,
            Some(RIVE_KEYFRAME_DOUBLE | RIVE_KEYFRAME_COLOR)
        ) {
            if let Some(keyframe_type) = keyframe_type {
                report_keyframe_kind(diagnostics.as_deref_mut(), keyframe_type, property_key);
            }
            continue;
        }
        let Ok(property_key) = u64::try_from(property_key) else {
            continue;
        };
        let Some(target) = create_rive_mutable_target(
            artboard.clone(),
            rebuilds,
            keyed_index,
            property_key,
            if keyframe_type == Some(RIVE_KEYFRAME_COLOR) {
                RiveFieldType::Color
            } else {
                RiveFieldType::Double
            },
        ) else {
            continue;
        };
        if let Some(channel) = create_rive_mutable_channel(
            objects,
            index,
            limit,
            fps,
            interpolators,
            target,
            diagnostics.as_deref_mut(),
        ) {
            channels.push(channel);
        }
    }
    close_keyed_run(
        &channels,
        keyed_index,
        run_properties,
        run_channels,
        run_diagnostics,
        diagnostics.as_deref_mut(),
    );

    let duration = read_rive_number(source, RIVE_ANIMATION_DURATION, 60.0) / fps;
    let has_work_area = read_rive_number(source, RIVE_ANIMATION_ENABLE_WORK_AREA, 0.0) != 0.0;
    let work_start = read_rive_number(source, RIVE_ANIMATION_WORK_START, RIVE_UNSET_FRAME);
    let work_end = read_rive_number(source, RIVE_ANIMATION_WORK_END, RIVE_UNSET_FRAME);
    return RiveAnimationClip {
        clip: create_animation_clip(channels, Some(duration), &[]),
        r#loop: to_rive_animation_loop(
            read_rive_number(source, RIVE_ANIMATION_LOOP, RIVE_LOOP_ONE_SHOT),
            diagnostics.as_deref_mut(),
        ),
        name: read_rive_text(source, RIVE_ANIMATION_NAME, ""),
        speed: read_rive_number(source, RIVE_ANIMATION_SPEED, 1.0),
        work_area_end: (has_work_area && work_end >= 0.0).then_some(work_end / fps),
        work_area_start: (has_work_area && work_start >= 0.0).then_some(work_start / fps),
    };
}

pub fn create_rive_animation_clips(
    objects: &[RiveCoreObject],
    range: RiveObjectRange,
    nodes: &[Option<Node2DRef>],
    artboard: &RiveArtboardGraph,
    rebuilds: &HashMap<usize, RiveRebuild>,
    skeleton: Option<&RiveSkeleton2DImport>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Vec<RiveAnimationClip> {
    return create_rive_animation_clips_with_artboard(
        objects,
        range,
        nodes,
        Arc::new(RwLock::new(artboard.clone())),
        rebuilds,
        skeleton,
        diagnostics,
    );
}

fn create_rive_animation_clips_with_artboard(
    objects: &[RiveCoreObject],
    range: RiveObjectRange,
    nodes: &[Option<Node2DRef>],
    artboard: Arc<RwLock<RiveArtboardGraph>>,
    rebuilds: &HashMap<usize, RiveRebuild>,
    skeleton: Option<&RiveSkeleton2DImport>,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Vec<RiveAnimationClip> {
    let interpolators = collect_rive_interpolators(objects, range, diagnostics.as_deref_mut());
    let mut clips = Vec::new();
    for index in range.start..range.end.min(objects.len()) {
        if objects[index].type_key != RIVE_LINEAR_ANIMATION {
            continue;
        }
        clips.push(create_rive_animation_clip(
            objects,
            index,
            range.end.min(objects.len()),
            nodes,
            &interpolators,
            artboard.clone(),
            rebuilds,
            skeleton,
            diagnostics.as_deref_mut(),
        ));
    }
    return clips;
}

fn create_rive_bone_channel(
    objects: &[RiveCoreObject],
    property_index: usize,
    limit: usize,
    fps: f32,
    interpolators: &HashMap<usize, EasingFn>,
    skeleton: Option<&RiveSkeleton2DImport>,
    keyed_index: i32,
    property_key: i64,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<AnimationChannel> {
    let skeleton = skeleton?;
    let source_index = usize::try_from(keyed_index).ok()?;
    let bone_index = *skeleton.bone_indices.get(source_index)?;
    let bone_position = usize::try_from(bone_index).ok()?;
    let path = to_rive_bone_animation_path(property_key)?;
    let convert = to_rive_bone_value_conversion(path, skeleton.skeleton.bones.get(bone_position)?);
    let Some(convert) = convert else {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Drop,
            "rive.unrepresentable-bone-scale",
            "createRiveBoneChannel",
            Some(HashMap::from([
                (
                    "bone".to_string(),
                    ImportDiagnosticDetailValue::Number(bone_index as f32),
                ),
                (
                    "property".to_string(),
                    ImportDiagnosticDetailValue::Number(property_key as f32),
                ),
            ])),
        );
        return None;
    };
    let target = create_skeleton_2d_bone_animation_target(bone_index, path);
    let handle = create_skeleton_2d_animation_target_handle(
        SKELETON_2D_ANIMATION_TARGET_KIND_BONE,
        Some(Arc::new(target)),
    );
    return create_rive_channel(
        objects,
        property_index,
        limit,
        fps,
        interpolators,
        convert,
        Some(Arc::new(handle)),
        diagnostics,
    );
}

fn create_rive_channel(
    objects: &[RiveCoreObject],
    property_index: usize,
    limit: usize,
    fps: f32,
    interpolators: &HashMap<usize, EasingFn>,
    convert: Arc<dyn Fn(f32) -> f32 + Send + Sync>,
    target_ref: flight_entity::Unknown,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<AnimationChannel> {
    return create_rive_typed_channel(
        objects,
        property_index,
        limit,
        fps,
        interpolators,
        1,
        &|keyframe| {
            (keyframe.type_key == RIVE_KEYFRAME_DOUBLE).then(|| {
                vec![convert(read_rive_number(
                    keyframe,
                    RIVE_KEYFRAME_DOUBLE_VALUE,
                    0.0,
                ))]
            })
        },
        target_ref,
        diagnostics,
    );
}

fn create_rive_mutable_channel(
    objects: &[RiveCoreObject],
    property_index: usize,
    limit: usize,
    fps: f32,
    interpolators: &HashMap<usize, EasingFn>,
    target: RiveMutableTarget,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<AnimationChannel> {
    let target_ref = Some(Arc::new(target) as Arc<dyn std::any::Any + Send + Sync>);
    if objects.get(property_index + 1)?.type_key == RIVE_KEYFRAME_COLOR {
        return create_rive_typed_channel(
            objects,
            property_index,
            limit,
            fps,
            interpolators,
            4,
            &read_rive_color_keyframe,
            target_ref,
            diagnostics,
        );
    }
    return create_rive_channel(
        objects,
        property_index,
        limit,
        fps,
        interpolators,
        Arc::new(|value| value),
        target_ref,
        diagnostics,
    );
}

fn create_rive_mutable_target(
    artboard: Arc<RwLock<RiveArtboardGraph>>,
    rebuilds: &HashMap<usize, RiveRebuild>,
    object_index: i32,
    property_key: u64,
    default_type: RiveFieldType,
) -> Option<RiveMutableTarget> {
    let object_index = usize::try_from(object_index).ok()?;
    let owner = {
        let artboard = artboard.read().unwrap();
        artboard.objects.get(object_index)?;
        find_rive_shape_owner(&artboard, object_index)
    };
    let rebuild = rebuilds.get(&owner)?.clone();
    return Some(RiveMutableTarget {
        artboard,
        default_type,
        object_index,
        property_key,
        rebuild,
    });
}

#[allow(clippy::too_many_arguments)]
fn create_rive_typed_channel(
    objects: &[RiveCoreObject],
    property_index: usize,
    limit: usize,
    fps: f32,
    interpolators: &HashMap<usize, EasingFn>,
    components: usize,
    read_value: &dyn Fn(&RiveCoreObject) -> Option<Vec<f32>>,
    target_ref: flight_entity::Unknown,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<AnimationChannel> {
    let mut times = Vec::new();
    let mut values = Vec::new();
    let mut segment_easings = Vec::new();
    for object in objects
        .iter()
        .take(limit)
        .skip(property_index.saturating_add(1))
    {
        if !is_rive_type(object.type_key, RIVE_INTERPOLATING_KEYFRAME) {
            break;
        }
        let Some(value) = read_value(object) else {
            break;
        };
        let time = read_rive_number(object, RIVE_KEYFRAME_FRAME, 0.0) / fps;
        if times.last().is_some_and(|previous| time <= *previous) {
            continue;
        }
        times.push(time);
        values.extend(value);
        segment_easings.push(to_rive_segment_easing(
            object,
            interpolators,
            diagnostics.as_deref_mut(),
        ));
    }
    if times.is_empty() {
        return None;
    }
    segment_easings.pop();
    let track = Arc::new(RwLock::new(create_animation_track(
        CreateAnimationTrackOpts {
            components: Some(components),
            interpolation: Some(AnimationInterpolation::Linear),
            segment_easings: Some(segment_easings),
            times,
            values,
            ..Default::default()
        },
    )));
    return Some(create_animation_channel(&track, target_ref));
}

pub fn apply_animation_clip_to_rive_document(clip: &flight_animation::AnimationClip, time: f32) {
    apply_animation_clip_to_node2d(clip, time);
    let mut pending = Vec::<RiveRebuild>::new();
    for channel in &clip.channels {
        let Some(target) = channel
            .target_ref
            .as_ref()
            .and_then(|target| target.downcast_ref::<RiveMutableTarget>())
        else {
            continue;
        };
        let components = channel.track.read().unwrap().components;
        let mut sample = vec![0.0_f32; components.max(4)];
        sample_animation_track(&mut sample, &channel.track.read().unwrap(), time);
        target.apply(&sample);
        if !pending
            .iter()
            .any(|rebuild| Arc::ptr_eq(rebuild, &target.rebuild))
        {
            pending.push(target.rebuild.clone());
        }
    }
    for rebuild in pending {
        rebuild();
    }
}

fn close_keyed_run(
    channels: &[AnimationChannel],
    keyed_index: i32,
    run_properties: usize,
    run_channels: usize,
    run_diagnostics: usize,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) {
    let current_diagnostics = diagnostics.as_ref().map_or(0, |sink| sink.len());
    if run_properties == 0
        || channels.len() != run_channels
        || current_diagnostics != run_diagnostics
    {
        return;
    }
    report_import_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Drop,
        "rive.keyed-object-unbound",
        "createRiveAnimationClip",
        Some(HashMap::from([
            (
                "objectId".to_string(),
                ImportDiagnosticDetailValue::Number(keyed_index as f32),
            ),
            (
                "properties".to_string(),
                ImportDiagnosticDetailValue::Number(run_properties as f32),
            ),
        ])),
    );
}

fn collect_rive_interpolators(
    objects: &[RiveCoreObject],
    range: RiveObjectRange,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> HashMap<usize, EasingFn> {
    let mut interpolators = HashMap::new();
    for (index, source) in objects
        .iter()
        .enumerate()
        .take(range.end.min(objects.len()))
        .skip(range.start)
    {
        if is_rive_type(source.type_key, RIVE_CUBIC_INTERPOLATOR) {
            interpolators.insert(
                index,
                ease_cubic_bezier(
                    read_rive_number(source, RIVE_INTERPOLATOR_X1, 0.42),
                    read_rive_number(source, RIVE_INTERPOLATOR_Y1, 0.0),
                    read_rive_number(source, RIVE_INTERPOLATOR_X2, 0.58),
                    read_rive_number(source, RIVE_INTERPOLATOR_Y2, 1.0),
                ),
            );
        } else if is_rive_type(source.type_key, RIVE_ELASTIC_INTERPOLATOR) {
            interpolators.insert(
                index,
                to_rive_elastic_easing(source, diagnostics.as_deref_mut()),
            );
        }
    }
    return interpolators;
}

fn default_rive_value(r#type: RiveFieldType) -> RiveValue {
    return match r#type {
        RiveFieldType::Uint => RiveValue::Uint(0),
        RiveFieldType::String => RiveValue::String(String::new()),
        RiveFieldType::Double => RiveValue::Double(0.0),
        RiveFieldType::Color => RiveValue::Color(0),
    };
}

fn diagnostic_count(diagnostics: &Option<&mut Vec<ImportDiagnostic>>) -> usize {
    return diagnostics.as_ref().map_or(0, |sink| sink.len());
}

fn find_rive_shape_owner(artboard: &RiveArtboardGraph, index: usize) -> usize {
    let mut current = index;
    while current > 0 {
        if artboard
            .objects
            .get(current)
            .is_some_and(|object| is_rive_type(object.type_key, RIVE_SHAPE_TYPE_KEY))
        {
            return current;
        }
        let Some(parent) = artboard.parent_indices.get(current).copied() else {
            break;
        };
        let Ok(parent) = usize::try_from(parent) else {
            break;
        };
        current = parent;
    }
    return usize::MAX;
}

fn is_rive_type(type_key: u64, base: u64) -> bool {
    let (Ok(type_key), Ok(base)) = (i32::try_from(type_key), i32::try_from(base)) else {
        return false;
    };
    return is_rive_core_type_derived_from(type_key, base);
}

fn pack_rive_color_sample(sample: &[f32]) -> u32 {
    let alpha = to_rive_color_byte(sample[0]);
    let red = to_rive_color_byte(sample[1]);
    let green = to_rive_color_byte(sample[2]);
    let blue = to_rive_color_byte(sample[3]);
    return (alpha << 24) | (red << 16) | (green << 8) | blue;
}

fn read_rive_color(source: &RiveCoreObject, key: u64, fallback: u32) -> u32 {
    let Some(property) = source
        .properties
        .iter()
        .find(|property| property.key == key)
    else {
        return fallback;
    };
    return match property.value {
        RiveValue::Color(value) => value,
        RiveValue::Uint(value) => u32::try_from(value).unwrap_or(fallback),
        _ => fallback,
    };
}

fn read_rive_color_keyframe(keyframe: &RiveCoreObject) -> Option<Vec<f32>> {
    if keyframe.type_key != RIVE_KEYFRAME_COLOR {
        return None;
    }
    let packed = read_rive_color(keyframe, RIVE_KEYFRAME_COLOR_VALUE, 0);
    return Some(vec![
        ((packed >> 24) & 0xff) as f32,
        ((packed >> 16) & 0xff) as f32,
        ((packed >> 8) & 0xff) as f32,
        (packed & 0xff) as f32,
    ]);
}

fn read_rive_number(source: &RiveCoreObject, key: u64, fallback: f32) -> f32 {
    let Some(property) = source
        .properties
        .iter()
        .find(|property| property.key == key)
    else {
        return fallback;
    };
    return match property.value {
        RiveValue::Uint(value) => value as f32,
        RiveValue::Double(value) => value,
        RiveValue::Color(value) => value as f32,
        _ => fallback,
    };
}

fn read_rive_text(source: &RiveCoreObject, key: u64, fallback: &str) -> String {
    let Some(property) = source
        .properties
        .iter()
        .find(|property| property.key == key)
    else {
        return fallback.to_string();
    };
    return match &property.value {
        RiveValue::String(value) => value.clone(),
        _ => fallback.to_string(),
    };
}

pub fn register_rive_animation_handlers(registry: &mut RiveImportRegistry) {
    register_rive_core_object_handler(
        registry,
        RIVE_LINEAR_ANIMATION as i32,
        Arc::new(RiveCoreObjectHandler {
            apply_artboard: Some(Arc::new(|context| {
                let clips = create_rive_animation_clips_with_artboard(
                    context.objects,
                    RiveObjectRange {
                        end: context.artboard.stream_end,
                        start: context.artboard.stream_start,
                    },
                    &context.nodes,
                    context.animation_artboard.clone(),
                    &context.rebuilds,
                    context.skeleton.as_ref(),
                    context.diagnostics.as_deref_mut(),
                );
                context.animations.extend(clips);
            })),
            apply_document: None,
            import_component: None,
        }),
    );
}

fn report_keyframe_kind(
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    keyframe_type: u64,
    property_key: i64,
) {
    report_import_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Drop,
        "rive.keyframe-kind-unsupported",
        "createRiveAnimationClip",
        Some(HashMap::from([
            (
                "keyframeTypeKey".to_string(),
                ImportDiagnosticDetailValue::Number(keyframe_type as f32),
            ),
            (
                "propertyKey".to_string(),
                ImportDiagnosticDetailValue::Number(property_key as f32),
            ),
        ])),
    );
}

fn to_rive_animation_loop(
    value: f32,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> RiveAnimationLoop {
    if value == RIVE_LOOP_LOOP {
        return RiveAnimationLoop::Loop;
    }
    if value == RIVE_LOOP_PING_PONG {
        return RiveAnimationLoop::PingPong;
    }
    if value != RIVE_LOOP_ONE_SHOT {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Recover,
            "rive.animation-loop-substituted",
            "toRiveAnimationLoop",
            Some(HashMap::from([
                (
                    "loopValue".to_string(),
                    ImportDiagnosticDetailValue::Number(value),
                ),
                (
                    "substitutedAs".to_string(),
                    ImportDiagnosticDetailValue::String("oneShot".to_string()),
                ),
            ])),
        );
    }
    return RiveAnimationLoop::OneShot;
}

fn to_rive_animation_path(property_key: i64) -> Option<Node2DAnimationPath> {
    return match property_key {
        RIVE_X | RIVE_X_LEGACY => Some(Node2DAnimationPath::X),
        RIVE_Y | RIVE_Y_LEGACY => Some(Node2DAnimationPath::Y),
        RIVE_ROTATION => Some(Node2DAnimationPath::Rotation),
        RIVE_SCALE_X => Some(Node2DAnimationPath::ScaleX),
        RIVE_SCALE_Y => Some(Node2DAnimationPath::ScaleY),
        RIVE_OPACITY => Some(Node2DAnimationPath::Alpha),
        _ => None,
    };
}

fn to_rive_bone_animation_path(property_key: i64) -> Option<&'static str> {
    return match property_key {
        RIVE_X | RIVE_X_LEGACY => Some(SKELETON_2D_ANIMATION_PATH_TRANSLATION_X),
        RIVE_Y | RIVE_Y_LEGACY => Some(SKELETON_2D_ANIMATION_PATH_TRANSLATION_Y),
        RIVE_ROTATION => Some(SKELETON_2D_ANIMATION_PATH_ROTATION),
        RIVE_SCALE_X => Some(SKELETON_2D_ANIMATION_PATH_SCALE_X),
        RIVE_SCALE_Y => Some(SKELETON_2D_ANIMATION_PATH_SCALE_Y),
        _ => None,
    };
}

fn to_rive_bone_value_conversion(
    path: &str,
    setup: &Bone2D,
) -> Option<Arc<dyn Fn(f32) -> f32 + Send + Sync>> {
    if path == SKELETON_2D_ANIMATION_PATH_TRANSLATION_X {
        let setup = setup.x;
        return Some(Arc::new(move |value| value - setup));
    }
    if path == SKELETON_2D_ANIMATION_PATH_TRANSLATION_Y {
        let setup = setup.y;
        return Some(Arc::new(move |value| value - setup));
    }
    if path == SKELETON_2D_ANIMATION_PATH_ROTATION {
        let setup = setup.rotation;
        return Some(Arc::new(move |value| value * RAD_TO_DEG - setup));
    }
    let setup_scale = if path == SKELETON_2D_ANIMATION_PATH_SCALE_X {
        setup.scale_x
    } else {
        setup.scale_y
    };
    if setup_scale == 0.0 {
        return None;
    }
    return Some(Arc::new(move |value| value / setup_scale));
}

fn to_rive_color_byte(value: f32) -> u32 {
    return value.clamp(0.0, 255.0).round() as u32;
}

fn to_rive_elastic_easing(
    source: &RiveCoreObject,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> EasingFn {
    let amplitude = read_rive_number(source, RIVE_INTERPOLATOR_AMPLITUDE, 1.0);
    let period = read_rive_number(
        source,
        RIVE_INTERPOLATOR_PERIOD,
        RIVE_DEFAULT_ELASTIC_PERIOD,
    );
    let easing = read_rive_number(source, RIVE_INTERPOLATOR_EASING, RIVE_ELASTIC_EASE_OUT);
    if easing == RIVE_ELASTIC_EASE_IN {
        return ease_in_damped_sine(amplitude, period);
    }
    if easing == RIVE_ELASTIC_EASE_IN_OUT {
        return ease_in_out_damped_sine(amplitude, period);
    }
    if easing != RIVE_ELASTIC_EASE_OUT {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Recover,
            "rive.elastic-easing-substituted",
            "toRiveElasticEasing",
            Some(HashMap::from([
                (
                    "easingValue".to_string(),
                    ImportDiagnosticDetailValue::Number(easing),
                ),
                (
                    "substitutedAs".to_string(),
                    ImportDiagnosticDetailValue::String("easeOut".to_string()),
                ),
            ])),
        );
    }
    return ease_out_damped_sine(amplitude, period);
}

fn to_rive_segment_easing(
    keyframe: &RiveCoreObject,
    interpolators: &HashMap<usize, EasingFn>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<EasingFn> {
    let r#type = read_rive_number(
        keyframe,
        RIVE_KEYFRAME_INTERPOLATION,
        RIVE_INTERPOLATION_HOLD,
    );
    if r#type == RIVE_INTERPOLATION_HOLD {
        return Some(Arc::new(|_| 0.0));
    }
    if r#type == RIVE_INTERPOLATION_LINEAR {
        return None;
    }
    let id = read_rive_number(keyframe, RIVE_KEYFRAME_INTERPOLATOR_ID, -1.0) as i64;
    let easing = usize::try_from(id)
        .ok()
        .and_then(|id| interpolators.get(&id))
        .cloned();
    if easing.is_none() {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Recover,
            "rive.keyframe-easing-substituted",
            "toRiveSegmentEasing",
            Some(HashMap::from([
                (
                    "interpolationType".to_string(),
                    ImportDiagnosticDetailValue::Number(r#type),
                ),
                (
                    "interpolatorId".to_string(),
                    ImportDiagnosticDetailValue::Number(id as f32),
                ),
                (
                    "substitutedAs".to_string(),
                    ImportDiagnosticDetailValue::String("linear".to_string()),
                ),
            ])),
        );
    }
    return easing;
}

fn to_rive_value_conversion(path: Node2DAnimationPath) -> Arc<dyn Fn(f32) -> f32 + Send + Sync> {
    if path == Node2DAnimationPath::Rotation {
        return Arc::new(|value| value * RAD_TO_DEG);
    }
    return Arc::new(|value| value);
}

const RIVE_KEYED_OBJECT: u64 = 25;
const RIVE_KEYED_PROPERTY: u64 = 26;
const RIVE_KEYFRAME: u64 = 29;
const RIVE_KEYFRAME_DOUBLE: u64 = 30;
const RIVE_SHAPE_TYPE_KEY: u64 = 3;
const RIVE_LINEAR_ANIMATION: u64 = 31;
const RIVE_KEYFRAME_COLOR: u64 = 37;
const RIVE_CUBIC_INTERPOLATOR: u64 = 139;
const RIVE_INTERPOLATING_KEYFRAME: u64 = 170;
const RIVE_ELASTIC_INTERPOLATOR: u64 = 174;

const RIVE_X_LEGACY: i64 = 9;
const RIVE_Y_LEGACY: i64 = 10;
const RIVE_X: i64 = 13;
const RIVE_Y: i64 = 14;
const RIVE_ROTATION: i64 = 15;
const RIVE_SCALE_X: i64 = 16;
const RIVE_SCALE_Y: i64 = 17;
const RIVE_OPACITY: i64 = 18;

const RIVE_KEYED_OBJECT_ID: u64 = 51;
const RIVE_KEYED_PROPERTY_KEY: u64 = 53;
const RIVE_ANIMATION_NAME: u64 = 55;
const RIVE_ANIMATION_FPS: u64 = 56;
const RIVE_ANIMATION_DURATION: u64 = 57;
const RIVE_ANIMATION_SPEED: u64 = 58;
const RIVE_ANIMATION_LOOP: u64 = 59;
const RIVE_ANIMATION_WORK_START: u64 = 60;
const RIVE_ANIMATION_WORK_END: u64 = 61;
const RIVE_ANIMATION_ENABLE_WORK_AREA: u64 = 62;
const RIVE_INTERPOLATOR_X1: u64 = 63;
const RIVE_INTERPOLATOR_Y1: u64 = 64;
const RIVE_INTERPOLATOR_X2: u64 = 65;
const RIVE_INTERPOLATOR_Y2: u64 = 66;
const RIVE_KEYFRAME_FRAME: u64 = 67;
const RIVE_KEYFRAME_INTERPOLATION: u64 = 68;
const RIVE_KEYFRAME_INTERPOLATOR_ID: u64 = 69;
const RIVE_KEYFRAME_DOUBLE_VALUE: u64 = 70;
const RIVE_KEYFRAME_COLOR_VALUE: u64 = 88;
const RIVE_INTERPOLATOR_EASING: u64 = 405;
const RIVE_INTERPOLATOR_AMPLITUDE: u64 = 406;
const RIVE_INTERPOLATOR_PERIOD: u64 = 407;

const RIVE_LOOP_ONE_SHOT: f32 = 0.0;
const RIVE_LOOP_LOOP: f32 = 1.0;
const RIVE_LOOP_PING_PONG: f32 = 2.0;
const RIVE_UNSET_FRAME: f32 = -1.0;

const RIVE_ELASTIC_EASE_IN: f32 = 0.0;
const RIVE_ELASTIC_EASE_OUT: f32 = 1.0;
const RIVE_ELASTIC_EASE_IN_OUT: f32 = 2.0;
const RIVE_DEFAULT_ELASTIC_PERIOD: f32 = 1.0;

const RIVE_INTERPOLATION_HOLD: f32 = 0.0;
const RIVE_INTERPOLATION_LINEAR: f32 = 1.0;

impl RiveMutableTarget {
    fn apply(&self, sample: &[f32]) {
        let mut artboard = self.artboard.write().unwrap();
        let Some(object) = artboard.objects.get_mut(self.object_index) else {
            return;
        };
        let property = if let Some(position) = object
            .properties
            .iter()
            .position(|property| property.key == self.property_key)
        {
            &mut object.properties[position]
        } else {
            object.properties.push(RiveProperty {
                key: self.property_key,
                r#type: self.default_type,
                value: default_rive_value(self.default_type),
            });
            object.properties.last_mut().unwrap()
        };
        property.value = if property.r#type == RiveFieldType::Color {
            RiveValue::Color(pack_rive_color_sample(sample))
        } else {
            RiveValue::Double(sample[0])
        };
    }
}
