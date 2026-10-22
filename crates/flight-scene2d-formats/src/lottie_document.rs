use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};

use flight_animation::contract::{
    AnimationClip, AnimationInterpolation, AnimationTrack, create_animation_channel,
    create_animation_clip, create_animation_clip_event, create_animation_track,
    sample_animation_track,
};
use flight_easing::contract::ease_cubic_bezier;
use flight_entity::{Ref, Unknown, UnknownValue, allocate_entity};
use flight_importdiagnostics::contract::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_materials::contract::{
    BLEND_MODE_DARKEN, BLEND_MODE_LIGHTEN, BLEND_MODE_MULTIPLY, BLEND_MODE_NORMAL,
    BLEND_MODE_SCREEN,
};
use flight_node::contract::{NodeRef, add_node_child, invalidate_node_local_transform};
use flight_scene2d::contract::{
    DisplayObject, Node2DAnimationPath, Node2DAnimationTarget, Node2DRef,
    apply_animation_clip_to_node2d, create_display_object,
};
use serde_json::Value;

use crate::lottie_registry::{get_lottie_layer_handler, get_lottie_mask_handler};
use crate::types::*;

#[derive(Clone)]
struct LottiePositionSampler {
    carrier: Ref<AnimationTrack>,
    first_time: f32,
    last_time: f32,
    sample: Arc<dyn Fn(&mut [f32], f32) + Send + Sync>,
    separated: bool,
}

fn create_lottie_layer_node(
    layer: &LottieLayer,
    context: &mut LottieImportContext<'_>,
) -> Ref<DisplayObject> {
    let container = create_display_object();
    container.write().unwrap().name = layer.get("nm").and_then(Value::as_str).map(str::to_string);
    let node: Node2DRef = container.clone();
    let hidden = layer.get("hd").and_then(Value::as_bool).unwrap_or(false);
    apply_lottie_transform(
        &node,
        layer.get("ks"),
        context,
        Some(!hidden),
        Some(layer.get("ao").and_then(Value::as_i64) == Some(1)),
    );
    report_lottie_expression(layer.get("ks"), context);
    if hidden {
        return container;
    }

    apply_lottie_layer_visibility(&node, layer, context);
    apply_lottie_blend_mode(&node, layer, context);
    let kind = record_i32(layer, "ty", -1);
    if let Some(handler) = get_lottie_layer_handler(context.registry, kind) {
        handler(&mut LottieLayerContext {
            container: node.clone(),
            import: context,
            layer,
        });
    } else if kind != 6 && kind != 13 {
        report_lottie_skip(
            context,
            "lottie.unsupported-layer",
            "createLottieLayerNode",
            Some(HashMap::from([(
                "layerType".to_string(),
                ImportDiagnosticDetailValue::Number(kind as f32),
            )])),
        );
    }

    let masks = record_array(layer, "masksProperties")
        .iter()
        .filter_map(value_to_lottie_record)
        .collect::<Vec<_>>();
    apply_lottie_mask_family(&node, &masks, context);
    return container;
}

fn create_lottie_position_sampler(
    property: Option<&Value>,
    context: &LottieImportContext<'_>,
) -> Option<LottiePositionSampler> {
    let property = property?;
    if is_separated_position(Some(property)) {
        let property = property.as_object()?;
        let create_track = |property: Option<&Value>| {
            let property = property?;
            if !is_animated_lottie_property(property) {
                return None;
            }
            let keyframes = property.get("k")?.as_array()?;
            let value_of: LottieTrackValueOf = Arc::new(|value, _index| {
                return lottie_numeric_json_value(value, 1);
            });
            let tangent_of: LottieTangentOf = Arc::new(|value, _component| value);
            return Some(create_lottie_track(
                keyframes,
                1,
                context,
                &value_of,
                0,
                false,
                &tangent_of,
            ));
        };
        let x_track = create_track(property.get("x"));
        let y_track = create_track(property.get("y"));
        let carrier = x_track.clone().or_else(|| y_track.clone())?;
        let x = lottie_numeric_json_value(initial_lottie_value(property.get("x")).as_ref(), 1)[0];
        let y = lottie_numeric_json_value(initial_lottie_value(property.get("y")).as_ref(), 1)[0];
        let populated = [x_track.as_ref(), y_track.as_ref()]
            .into_iter()
            .flatten()
            .filter_map(|track| {
                let track = track.read().unwrap();
                Some((*track.times.first()?, *track.times.last()?))
            })
            .collect::<Vec<_>>();
        let first_time = populated
            .iter()
            .map(|(first, _last)| *first)
            .reduce(f32::min)?;
        let last_time = populated
            .iter()
            .map(|(_first, last)| *last)
            .reduce(f32::max)?;
        return Some(LottiePositionSampler {
            carrier,
            first_time,
            last_time,
            sample: Arc::new(move |out, time| {
                out[0] = x;
                out[1] = y;
                if let Some(track) = &x_track {
                    sample_animation_track(out, &track.read().unwrap(), time);
                }
                if let Some(track) = &y_track {
                    let mut sample = [0.0];
                    sample_animation_track(&mut sample, &track.read().unwrap(), time);
                    out[1] = sample[0];
                }
            }),
            separated: true,
        });
    }
    if !is_animated_lottie_property(property) {
        return None;
    }
    let keyframes = property.get("k")?.as_array()?;
    let value_of: LottieTrackValueOf = Arc::new(|value, _index| {
        return lottie_numeric_json_value(value, 2);
    });
    let tangent_of: LottieTangentOf = Arc::new(|value, _component| value);
    let track = create_lottie_track(
        keyframes,
        2,
        context,
        &value_of,
        0,
        has_spatial_tangents(keyframes),
        &tangent_of,
    );
    let (first_time, last_time) = {
        let track = track.read().unwrap();
        (*track.times.first()?, *track.times.last()?)
    };
    let sample_track = track.clone();
    return Some(LottiePositionSampler {
        carrier: track,
        first_time,
        last_time,
        sample: Arc::new(move |out, time| {
            sample_animation_track(out, &sample_track.read().unwrap(), time);
        }),
        separated: false,
    });
}

fn create_lottie_segment_easing(
    outgoing: Option<&Value>,
    incoming: Option<&Value>,
    component: usize,
) -> Option<flight_animation::EasingFn> {
    let outgoing = outgoing?.as_object()?;
    let incoming = incoming?.as_object()?;
    return Some(ease_cubic_bezier(
        handle_component(outgoing.get("x"), component),
        handle_component(outgoing.get("y"), component),
        handle_component(incoming.get("x"), component),
        handle_component(incoming.get("y"), component),
    ));
}

fn create_lottie_spatial_segment_easing(
    temporal: Option<flight_animation::EasingFn>,
    start: &[f32],
    end: &[f32],
    outgoing: &[f32],
    incoming: &[f32],
) -> flight_animation::EasingFn {
    const SAMPLES: usize = 150;
    let mut lengths = vec![0.0; SAMPLES];
    let mut previous = start.to_vec();
    for index in 1..SAMPLES {
        let point = sample_lottie_spatial_bezier(
            start,
            end,
            outgoing,
            incoming,
            index as f32 / (SAMPLES - 1) as f32,
        );
        let distance = point
            .iter()
            .zip(&previous)
            .map(|(point, previous)| (point - previous).powi(2))
            .sum::<f32>()
            .sqrt();
        lengths[index] = lengths[index - 1] + distance;
        previous = point;
    }
    let total = lengths[SAMPLES - 1];
    return Arc::new(move |alpha| {
        let distance_fraction = temporal.as_ref().map_or(alpha, |temporal| temporal(alpha));
        if distance_fraction <= 0.0 || total == 0.0 {
            return 0.0;
        }
        if distance_fraction >= 1.0 {
            return 1.0;
        }
        let distance = total * distance_fraction;
        let mut low = 0;
        let mut high = lengths.len() - 1;
        while low + 1 < high {
            let middle = (low + high) >> 1;
            if lengths[middle] <= distance {
                low = middle;
            } else {
                high = middle;
            }
        }
        let span = lengths[high] - lengths[low];
        let fraction = if span > 0.0 {
            (distance - lengths[low]) / span
        } else {
            0.0
        };
        return (low as f32 + fraction) / (SAMPLES - 1) as f32;
    });
}

fn create_lottie_spatial_track_values(
    keyframes: &[Value],
    samples: &[Vec<f32>],
    times: &[f32],
    components: usize,
    tangent_of: &LottieTangentOf,
) -> Vec<f32> {
    let mut incoming = vec![vec![0.0; components]; samples.len()];
    let mut outgoing = vec![vec![0.0; components]; samples.len()];
    for index in 0..samples.len().saturating_sub(1) {
        let dt = times[index + 1] - times[index];
        let spatial_out = spatial_tangent(keyframes[index].get("to"), components, tangent_of);
        let spatial_in = spatial_tangent(keyframes[index].get("ti"), components, tangent_of);
        for component in 0..components {
            if let (Some(spatial_out), Some(spatial_in)) = (&spatial_out, &spatial_in) {
                outgoing[index][component] = 3.0 * spatial_out[component] / dt;
                incoming[index + 1][component] = -3.0 * spatial_in[component] / dt;
            } else {
                let slope = (samples[index + 1][component] - samples[index][component]) / dt;
                outgoing[index][component] = slope;
                incoming[index + 1][component] = slope;
            }
        }
    }
    let mut values = Vec::new();
    for index in 0..samples.len() {
        values.extend_from_slice(&incoming[index]);
        values.extend_from_slice(&samples[index]);
        values.extend_from_slice(&outgoing[index]);
    }
    return values;
}

// flight-lint: allow(conform-params, contract-vocabulary) D24: Rust passes callbacks by shared handle and serde_json::Value preserves the open Lottie keyframe union
pub fn create_lottie_track(
    keyframes: &[Value],
    components: usize,
    context: &LottieImportContext<'_>,
    value_of: &LottieTrackValueOf,
    easing_component: usize,
    spatial_tangents: bool,
    tangent_of: &LottieTangentOf,
) -> Ref<AnimationTrack> {
    let mut times = Vec::new();
    let mut samples = Vec::new();
    let mut retained = Vec::new();
    for (index, keyframe) in keyframes.iter().enumerate() {
        let time = frame_to_seconds(value_f32(keyframe.get("t"), 0.0), context);
        if times.last().is_some_and(|previous| time <= *previous) {
            continue;
        }
        let source = keyframe.get("s").or_else(|| {
            index
                .checked_sub(1)
                .and_then(|index| keyframes[index].get("e"))
        });
        times.push(time);
        samples.push(value_of(source, index));
        retained.push(keyframe.clone());
    }
    let spatial = spatial_tangents && has_spatial_tangents(&retained);
    let values = if spatial {
        create_lottie_spatial_track_values(&retained, &samples, &times, components, tangent_of)
    } else {
        samples.iter().flatten().copied().collect()
    };
    let mut segment_easings = Vec::new();
    for index in 0..retained.len().saturating_sub(1) {
        let keyframe = retained[index]
            .as_object()
            .expect("retained keyframe is an object");
        let temporal = if keyframe.get("h").and_then(Value::as_i64) == Some(1) {
            Some(Arc::new(|_alpha: f32| 0.0_f32) as flight_animation::EasingFn)
        } else {
            create_lottie_segment_easing(keyframe.get("o"), keyframe.get("i"), easing_component)
        };
        if spatial {
            let outgoing = spatial_tangent(keyframe.get("to"), components, tangent_of);
            let incoming = spatial_tangent(keyframe.get("ti"), components, tangent_of);
            if let (Some(outgoing), Some(incoming)) = (outgoing, incoming) {
                segment_easings.push(Some(create_lottie_spatial_segment_easing(
                    temporal,
                    &samples[index],
                    &samples[index + 1],
                    &outgoing,
                    &incoming,
                )));
                continue;
            }
        }
        segment_easings.push(temporal);
    }
    let track = {
        let mut track = create_animation_track();
        track.components = components;
        track.interpolation = if spatial {
            AnimationInterpolation::Cubic
        } else {
            AnimationInterpolation::Linear
        };
        track.segment_easings = Some(segment_easings);
        track.times = times;
        track.values = values;
        track
    };
    return Arc::new(RwLock::new(track));
}

// flight-lint: allow(contract-vocabulary) the source union is either an open Lottie JSON object or its JSON string encoding
pub fn create_scene2d_from_lottie_document_with_registry(
    source: &Value,
    registry: &LottieRegistry,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    options: Option<&LottieDocumentImportOptions>,
) -> LottieDocumentImportResult {
    let root = create_display_object();
    let document = parse_lottie_document(source);
    if document
        .as_ref()
        .is_none_or(|document| !is_valid_lottie_document(document))
    {
        report_import_diagnostic(
            diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Reject,
            "lottie.invalid-document",
            "createScene2DFromLottieDocument",
            None,
        );
        let mut out: LottieDocumentImportResult = allocate_entity();
        initialize_lottie_document_import_result(
            &mut out,
            root,
            Vec::new(),
            create_animation_clip(Vec::new(), Some(0.0), &[]),
            0.0,
            0.0,
        );
        return out;
    }
    let document = document.unwrap();
    let assets = record_array(&document, "assets")
        .iter()
        .filter_map(|value| {
            let asset = value_to_lottie_record(value)?;
            let id = asset.get("id")?.as_str()?.to_string();
            Some((id, asset))
        })
        .collect();
    let mut context = LottieImportContext {
        advanced_blends: Vec::new(),
        assets,
        channels: Vec::new(),
        diagnostics,
        document: &document,
        frame_offset: 0.0,
        frame_scale: 1.0,
        registry,
        resolve_image_resource: options.and_then(|options| options.resolve_image_resource.clone()),
        resolving_precompositions: HashSet::new(),
    };
    let layers = record_array(&document, "layers")
        .iter()
        .filter_map(value_to_lottie_record)
        .collect::<Vec<_>>();
    let root_node: Node2DRef = root.clone();
    append_lottie_layers(&root_node, &layers, &mut context);
    let frame_rate = record_f32(&document, "fr", 0.0);
    let first_frame = record_f32(&document, "ip", 0.0);
    let last_frame = record_f32(&document, "op", first_frame);
    let duration = ((last_frame - first_frame) / frame_rate).max(0.0);
    let events = record_array(&document, "markers")
        .iter()
        .filter_map(|marker| {
            let marker = marker.as_object()?;
            let name = marker.get("cm")?.as_str()?;
            let time = lottie_clamp(
                (value_f32(marker.get("tm"), first_frame) - first_frame) / frame_rate,
                0.0,
                duration,
            );
            Some({
                let mut event = create_animation_clip_event();
                event.time = time;
                event.name = (name).to_string();
                event.payload = 0;
                event
            })
        })
        .collect::<Vec<_>>();
    let advanced_blends = std::mem::take(&mut context.advanced_blends);
    let channels = std::mem::take(&mut context.channels);
    let mut out: LottieDocumentImportResult = allocate_entity();
    initialize_lottie_document_import_result(
        &mut out,
        root,
        advanced_blends,
        create_animation_clip(channels, Some(duration), &events),
        duration,
        frame_rate,
    );
    return out;
}

pub fn initialize_lottie_document_import_result(
    out: &mut LottieDocumentImportResult,
    root: Ref<DisplayObject>,
    advanced_blends: Vec<LottieAdvancedBlend>,
    clip: AnimationClip,
    duration: f32,
    frame_rate: f32,
) {
    out.advanced_blends = advanced_blends;
    out.clip = clip;
    out.duration = duration;
    out.frame_rate = frame_rate;
    out.root = root;
}

fn append_lottie_auto_orientation(
    target: &Node2DRef,
    property: Option<&Value>,
    rotation: Option<&Value>,
    context: &mut LottieImportContext<'_>,
) {
    let Some(sampler) = create_lottie_position_sampler(property, context) else {
        return;
    };
    let base_rotation = target.read().unwrap().node2d_fields().rotation;
    let rotation_track = rotation
        .filter(|rotation| is_animated_lottie_property(rotation))
        .and_then(|rotation| rotation.get("k"))
        .and_then(Value::as_array)
        .map(|keyframes| {
            let value_of: LottieTrackValueOf = Arc::new(|value, _index| {
                return lottie_numeric_json_value(value, 1);
            });
            let tangent_of: LottieTangentOf = Arc::new(|value, _component| value);
            return create_lottie_track(keyframes, 1, context, &value_of, 0, false, &tangent_of);
        });
    let frame_step = context.frame_scale.abs() / record_f32(context.document, "fr", 1.0);
    let target_node = target.clone();
    let apply_orientation = Arc::new(move |time: f32| {
        let (previous_time, current_time) = if time <= sampler.first_time {
            (sampler.first_time, sampler.first_time + frame_step * 0.01)
        } else if time >= sampler.last_time {
            (
                sampler.last_time - frame_step * if sampler.separated { 0.01 } else { 0.05 },
                sampler.last_time,
            )
        } else {
            (time - frame_step * 0.01, time)
        };
        let mut previous = [0.0, 0.0];
        let mut current = [0.0, 0.0];
        (sampler.sample)(&mut previous, previous_time);
        (sampler.sample)(&mut current, current_time);
        let orientation = (current[1] - previous[1]).atan2(current[0] - previous[0]) * 180.0
            / std::f32::consts::PI;
        let rotation = rotation_track.as_ref().map_or(base_rotation, |track| {
            let mut sample = [0.0];
            sample_animation_track(&mut sample, &track.read().unwrap(), time);
            return sample[0];
        });
        target_node.write().unwrap().node2d_fields_mut().rotation = rotation + orientation;
        let node: NodeRef = target_node.clone();
        invalidate_node_local_transform(&node);
    });
    apply_orientation(sampler.first_time);
    let apply = apply_orientation.clone();
    context.channels.push(create_animation_channel(
        &sampler.carrier,
        Some(Arc::new(LottieMutableAnimationTarget {
            apply: Arc::new(move |_sample, time| apply(time)),
        })),
    ));
}

pub fn append_lottie_layers(
    root: &Node2DRef,
    layers: &[LottieLayer],
    context: &mut LottieImportContext<'_>,
) {
    let mut nodes: HashMap<i32, Node2DRef> = HashMap::new();
    let mut ordered = Vec::new();
    for layer in layers {
        let node = create_lottie_layer_node(layer, context);
        if let Some(index) = layer.get("ind").and_then(Value::as_i64) {
            nodes.insert(index as i32, node.clone());
        }
        ordered.push((layer, node));
    }
    for (layer, node) in ordered.into_iter().rev() {
        let parent = layer
            .get("parent")
            .and_then(Value::as_i64)
            .and_then(|index| nodes.get(&(index as i32)))
            .cloned()
            .unwrap_or_else(|| root.clone());
        let parent: NodeRef = parent;
        let child: NodeRef = node;
        add_node_child(&parent, &child);
    }
}

fn append_numeric_property_channels(
    property: &Value,
    components: usize,
    target: &dyn Fn(Option<usize>) -> Unknown,
    convert: &LottieNumericConverter,
    context: &mut LottieImportContext<'_>,
    spatial_tangents: bool,
) {
    if !is_animated_lottie_property(property) {
        return;
    }
    let Some(keyframes) = property.get("k").and_then(Value::as_array) else {
        return;
    };
    let spatial = spatial_tangents && has_spatial_tangents(keyframes);
    let component_specific =
        !spatial && has_component_specific_lottie_easing(keyframes, components);
    if component_specific && components > 1 {
        for component in 0..components {
            let convert = convert.clone();
            let value_of: LottieTrackValueOf = Arc::new(move |value, _index| {
                return vec![convert(
                    lottie_numeric_json_value(value, components)[component],
                    component,
                )];
            });
            let tangent_of: LottieTangentOf = Arc::new(|value, _component| value);
            let track = create_lottie_track(
                keyframes,
                1,
                context,
                &value_of,
                component,
                false,
                &tangent_of,
            );
            context
                .channels
                .push(create_animation_channel(&track, target(Some(component))));
        }
        return;
    }
    let convert_value = convert.clone();
    let value_of: LottieTrackValueOf = Arc::new(move |value, _index| {
        return lottie_numeric_json_value(value, components)
            .into_iter()
            .enumerate()
            .map(|(component, value)| convert_value(value, component))
            .collect();
    });
    let convert_tangent = convert.clone();
    let tangent_of: LottieTangentOf = Arc::new(move |value, component| {
        return convert_tangent(value, component) - convert_tangent(0.0, component);
    });
    let track = create_lottie_track(
        keyframes,
        components,
        context,
        &value_of,
        0,
        spatial_tangents,
        &tangent_of,
    );
    context
        .channels
        .push(create_animation_channel(&track, target(None)));
}

pub fn apply_animation_clip_to_lottie_document(clip: &AnimationClip, time: f32) {
    apply_animation_clip_to_node2d(clip, time);
    for channel in &clip.channels {
        let Some(target) = channel
            .target_ref
            .as_ref()
            .and_then(|target| target.downcast_ref::<LottieMutableAnimationTarget>())
        else {
            continue;
        };
        let track = channel.track.read().unwrap();
        let mut sample = vec![0.0; track.components];
        sample_animation_track(&mut sample, &track, time);
        drop(track);
        (target.apply)(&sample, time);
    }
}

fn apply_display_sample(target: &Node2DRef, path: Node2DAnimationPath, sample: &[f32]) {
    let mut node = target.write().unwrap();
    let fields = node.node2d_fields_mut();
    match path {
        Node2DAnimationPath::Position => {
            fields.x = sample[0];
            fields.y = sample[1];
        }
        Node2DAnimationPath::X => fields.x = sample[0],
        Node2DAnimationPath::Y => fields.y = sample[0],
        Node2DAnimationPath::Pivot => {
            fields.pivot_x = sample[0];
            fields.pivot_y = sample[1];
        }
        Node2DAnimationPath::PivotX => fields.pivot_x = sample[0],
        Node2DAnimationPath::PivotY => fields.pivot_y = sample[0],
        Node2DAnimationPath::Scale => {
            fields.scale_x = sample[0];
            fields.scale_y = sample[1];
        }
        Node2DAnimationPath::ScaleX => fields.scale_x = sample[0],
        Node2DAnimationPath::ScaleY => fields.scale_y = sample[0],
        Node2DAnimationPath::Rotation => fields.rotation = sample[0],
        Node2DAnimationPath::SkewX => fields.skew_x = sample[0],
        Node2DAnimationPath::Alpha => fields.alpha = sample[0],
        _ => {}
    }
}

fn apply_lottie_blend_mode(
    target: &Node2DRef,
    layer: &LottieLayer,
    context: &mut LottieImportContext<'_>,
) {
    let mode = record_i32(layer, "bm", 0);
    let fixed = match mode {
        0 => Some(BLEND_MODE_NORMAL),
        1 => Some(BLEND_MODE_MULTIPLY),
        2 => Some(BLEND_MODE_SCREEN),
        4 => Some(BLEND_MODE_DARKEN),
        5 => Some(BLEND_MODE_LIGHTEN),
        _ => None,
    };
    if let Some(fixed) = fixed {
        target.write().unwrap().node2d_fields_mut().blend_mode = Some(fixed.to_string());
        return;
    }
    target.write().unwrap().node2d_fields_mut().blend_mode = Some(BLEND_MODE_NORMAL.to_string());
    let advanced = match mode {
        3 => Some("Overlay"),
        6 => Some("ColorDodge"),
        7 => Some("ColorBurn"),
        8 => Some("HardLight"),
        9 => Some("SoftLight"),
        10 => Some("Difference"),
        11 => Some("Exclusion"),
        12 => Some("Hue"),
        13 => Some("Saturation"),
        14 => Some("Color"),
        15 => Some("Luminosity"),
        _ => None,
    };
    if let Some(advanced) = advanced {
        context.advanced_blends.push(LottieAdvancedBlend {
            mode: advanced.to_string(),
            node: target.clone(),
        });
    }
}

fn apply_lottie_layer_visibility(
    target: &Node2DRef,
    layer: &LottieLayer,
    context: &mut LottieImportContext<'_>,
) {
    let start = frame_to_seconds(
        record_f32(layer, "ip", record_f32(context.document, "ip", 0.0)),
        context,
    );
    let end = frame_to_seconds(
        record_f32(layer, "op", record_f32(context.document, "op", 0.0)),
        context,
    );
    target.write().unwrap().node2d_fields_mut().visible = start <= 0.0 && end > 0.0;
    let duration = ((record_f32(context.document, "op", 0.0)
        - record_f32(context.document, "ip", 0.0))
        / record_f32(context.document, "fr", 1.0))
    .max(0.0);
    let candidates = [
        0.0,
        lottie_clamp(start, 0.0, duration),
        lottie_clamp(end, 0.0, duration),
        duration,
    ];
    let mut times = Vec::new();
    for (index, time) in candidates.into_iter().enumerate() {
        if index == 0 || time > candidates[index - 1] {
            times.push(time);
        }
    }
    if times.len() < 2 {
        return;
    }
    let values = times
        .iter()
        .map(|time| {
            if *time >= start && *time < end {
                1.0
            } else {
                0.0
            }
        })
        .collect();
    let track = Arc::new(RwLock::new({
        let mut track = create_animation_track();
        track.interpolation = AnimationInterpolation::Step;
        track.times = times;
        track.values = values;
        track
    }));
    context.channels.push(create_animation_channel(
        &track,
        Some(Arc::new(Node2DAnimationTarget {
            node: target.clone(),
            path: Node2DAnimationPath::Visible,
        })),
    ));
}

pub fn apply_lottie_mask_family(
    target: &Node2DRef,
    masks: &[LottieMask],
    context: &mut LottieImportContext<'_>,
) {
    let active = masks
        .iter()
        .filter(|mask| mask.get("mode").and_then(Value::as_str) != Some(LOTTIE_MASK_KIND_NONE))
        .cloned()
        .collect::<Vec<_>>();
    let Some(kind) = active
        .first()
        .and_then(|mask| mask.get("mode"))
        .and_then(Value::as_str)
    else {
        return;
    };
    if let Some(handler) = get_lottie_mask_handler(context.registry, kind) {
        handler(&mut LottieMaskContext {
            import: context,
            masks: &active,
            target: target.clone(),
        });
    }
}

fn apply_lottie_scalar_property(
    target: &Node2DRef,
    property: Option<&Value>,
    path: Node2DAnimationPath,
    scale: f32,
    context: &mut LottieImportContext<'_>,
) {
    let Some(property) = property else {
        return;
    };
    let initial = initial_lottie_value(Some(property));
    let sample = lottie_numeric_json_value(initial.as_ref(), 1);
    apply_display_sample(target, path, &[sample[0] * scale]);
    if !is_animated_lottie_property(property) {
        return;
    }
    let target_node = target.clone();
    let target_factory = move |_component: Option<usize>| -> Unknown {
        return Some(Arc::new(Node2DAnimationTarget {
            node: target_node.clone(),
            path,
        }));
    };
    let convert: LottieNumericConverter = Arc::new(move |value, _component| value * scale);
    append_numeric_property_channels(property, 1, &target_factory, &convert, context, false);
}

// flight-lint: allow(contract-vocabulary) serde_json::Value preserves the open Lottie transform/property unions through handler dispatch
pub fn apply_lottie_transform(
    target: &Node2DRef,
    transform: Option<&Value>,
    context: &mut LottieImportContext<'_>,
    include_opacity: Option<bool>,
    auto_orient: Option<bool>,
) {
    let Some(transform) = transform.and_then(Value::as_object) else {
        return;
    };
    let position = transform.get("p");
    if is_separated_position(position) {
        let position = position.and_then(Value::as_object).unwrap();
        apply_lottie_scalar_property(
            target,
            position.get("x"),
            Node2DAnimationPath::X,
            1.0,
            context,
        );
        apply_lottie_scalar_property(
            target,
            position.get("y"),
            Node2DAnimationPath::Y,
            1.0,
            context,
        );
    } else {
        apply_lottie_vector_property(
            target,
            position,
            Node2DAnimationPath::Position,
            &[Node2DAnimationPath::X, Node2DAnimationPath::Y],
            2,
            1.0,
            context,
            true,
        );
    }
    apply_lottie_vector_property(
        target,
        transform.get("a"),
        Node2DAnimationPath::Pivot,
        &[Node2DAnimationPath::PivotX, Node2DAnimationPath::PivotY],
        2,
        1.0,
        context,
        false,
    );
    apply_lottie_vector_property(
        target,
        transform.get("s"),
        Node2DAnimationPath::Scale,
        &[Node2DAnimationPath::ScaleX, Node2DAnimationPath::ScaleY],
        2,
        0.01,
        context,
        false,
    );
    apply_lottie_scalar_property(
        target,
        transform.get("r").or_else(|| transform.get("rz")),
        Node2DAnimationPath::Rotation,
        1.0,
        context,
    );
    if include_opacity.unwrap_or(true) {
        apply_lottie_scalar_property(
            target,
            transform.get("o"),
            Node2DAnimationPath::Alpha,
            0.01,
            context,
        );
    }
    apply_lottie_scalar_property(
        target,
        transform.get("sk"),
        Node2DAnimationPath::SkewX,
        1.0,
        context,
    );
    if auto_orient.unwrap_or(false) {
        append_lottie_auto_orientation(
            target,
            transform.get("p"),
            transform.get("r").or_else(|| transform.get("rz")),
            context,
        );
    }
    let node: NodeRef = target.clone();
    invalidate_node_local_transform(&node);
}

fn apply_lottie_vector_property(
    target: &Node2DRef,
    property: Option<&Value>,
    vector_path: Node2DAnimationPath,
    scalar_paths: &[Node2DAnimationPath],
    components: usize,
    scale: f32,
    context: &mut LottieImportContext<'_>,
    spatial_tangents: bool,
) {
    let Some(property) = property else {
        return;
    };
    let initial = initial_lottie_value(Some(property));
    let sample = lottie_numeric_json_value(initial.as_ref(), components)
        .into_iter()
        .map(|value| value * scale)
        .collect::<Vec<_>>();
    apply_display_sample(target, vector_path, &sample);
    if !is_animated_lottie_property(property) {
        return;
    }
    let node = target.clone();
    let scalar_paths = scalar_paths.to_vec();
    let target_factory = move |component: Option<usize>| -> Unknown {
        return Some(Arc::new(Node2DAnimationTarget {
            node: node.clone(),
            path: component.map_or(vector_path, |component| scalar_paths[component]),
        }));
    };
    let convert: LottieNumericConverter = Arc::new(move |value, _component| value * scale);
    append_numeric_property_channels(
        property,
        components,
        &target_factory,
        &convert,
        context,
        spatial_tangents,
    );
}

// flight-lint: allow(conform-params, contract-vocabulary) D24: caller-owned shared numeric state replaces the retained JS array; Value preserves its animatable union
pub fn bind_mutable_lottie_numeric_property(
    property: &Value,
    current: &Arc<RwLock<Vec<f32>>>,
    convert: &LottieNumericConverter,
    on_change: &LottieRerender,
    context: &mut LottieImportContext<'_>,
) {
    if !is_animated_lottie_property(property) {
        return;
    }
    let components = current.read().unwrap().len();
    let current = current.clone();
    let on_change = on_change.clone();
    let target = move |component: Option<usize>| -> Unknown {
        let current = current.clone();
        let on_change = on_change.clone();
        return Some(Arc::new(LottieMutableAnimationTarget {
            apply: Arc::new(move |sample, _time| {
                {
                    let mut current = current.write().unwrap();
                    if let Some(component) = component {
                        current[component] = sample[0];
                    } else {
                        current.copy_from_slice(sample);
                    }
                }
                on_change();
            }),
        }));
    };
    append_numeric_property_channels(property, components, &target, convert, context, false);
}

fn frame_to_seconds(frame: f32, context: &LottieImportContext<'_>) -> f32 {
    return (context.frame_offset + frame * context.frame_scale
        - record_f32(context.document, "ip", 0.0))
        / record_f32(context.document, "fr", 1.0);
}

fn handle_component(value: Option<&Value>, component: usize) -> f32 {
    let Some(value) = value else {
        return 0.0;
    };
    if let Some(values) = value.as_array() {
        return value_f32(values.get(component).or_else(|| values.first()), 0.0);
    }
    return value_f32(Some(value), 0.0);
}

fn handle_varies(value: Option<&Value>, components: usize) -> bool {
    let Some(values) = value.and_then(Value::as_array) else {
        return false;
    };
    if values.len() < 2 {
        return false;
    }
    let first = value_f32(values.first(), 0.0);
    return (1..components).any(|component| {
        value_f32(values.get(component).or_else(|| values.first()), 0.0) != first
    });
}

// flight-lint: allow(contract-vocabulary) serde_json::Value preserves the open Lottie keyframe union
pub fn has_component_specific_lottie_easing(keyframes: &[Value], components: usize) -> bool {
    if components < 2 {
        return false;
    }
    for keyframe in keyframes.iter().take(keyframes.len().saturating_sub(1)) {
        for handle in [keyframe.get("o"), keyframe.get("i")].into_iter().flatten() {
            if handle_varies(handle.get("x"), components)
                || handle_varies(handle.get("y"), components)
            {
                return true;
            }
        }
    }
    return false;
}

fn has_spatial_tangents(keyframes: &[Value]) -> bool {
    return keyframes.iter().enumerate().any(|(index, keyframe)| {
        index < keyframes.len().saturating_sub(1)
            && keyframe.get("to").is_some_and(Value::is_array)
            && keyframe.get("ti").is_some_and(Value::is_array)
    });
}

// flight-lint: allow(contract-vocabulary) serde_json::Value preserves both arms of the generic Lottie animatable union
pub fn initial_lottie_value(property: Option<&Value>) -> Option<Value> {
    let property = property?;
    if !is_animated_lottie_property(property) {
        return property.get("k").cloned();
    }
    let first = property.get("k")?.as_array()?.first()?;
    return first.get("s").or_else(|| first.get("e")).cloned();
}

// flight-lint: allow(contract-vocabulary) serde_json::Value preserves both arms of the generic Lottie animatable union
pub fn is_animated_lottie_property(property: &Value) -> bool {
    let Some(keyframes) = property.get("k").and_then(Value::as_array) else {
        return false;
    };
    return keyframes
        .first()
        .and_then(Value::as_object)
        .is_some_and(|keyframe| keyframe.contains_key("t"));
}

fn is_separated_position(property: Option<&Value>) -> bool {
    let Some(property) = property.and_then(Value::as_object) else {
        return false;
    };
    return property.get("s").and_then(Value::as_bool) == Some(true)
        && property.contains_key("x")
        && property.contains_key("y");
}

fn is_valid_lottie_document(document: &LottieDocument) -> bool {
    let frame_rate = record_f32(document, "fr", f32::NAN);
    let first_frame = record_f32(document, "ip", f32::NAN);
    let last_frame = record_f32(document, "op", f32::NAN);
    let width = record_f32(document, "w", f32::NAN);
    let height = record_f32(document, "h", f32::NAN);
    return frame_rate.is_finite()
        && frame_rate > 0.0
        && first_frame.is_finite()
        && last_frame.is_finite()
        && last_frame >= first_frame
        && width.is_finite()
        && height.is_finite()
        && document.get("layers").is_some_and(Value::is_array);
}

pub fn lottie_clamp(value: f32, minimum: f32, maximum: f32) -> f32 {
    if value.is_nan() || minimum.is_nan() || maximum.is_nan() {
        return f32::NAN;
    }
    return value.max(minimum).min(maximum);
}

pub fn lottie_degrees_to_radians(value: f32) -> f32 {
    return value * std::f32::consts::PI / 180.0;
}

pub(crate) fn lottie_numeric_json_value(value: Option<&Value>, components: usize) -> Vec<f32> {
    let source = value.and_then(Value::as_array);
    let first = source
        .and_then(|source| source.first())
        .filter(|value| !value.is_null())
        .or(value)
        .map(number_from_json)
        .unwrap_or(0.0);
    return (0..components)
        .map(|index| {
            let candidate = source
                .and_then(|source| source.get(index))
                .filter(|value| !value.is_null())
                .map(number_from_json)
                .unwrap_or(first);
            return if candidate.is_finite() {
                candidate
            } else {
                0.0
            };
        })
        .collect();
}

// flight-lint: allow(conform-params) D24: caller-owned vector replaces the structured number-array return (user-approved)
pub fn lottie_numeric_value(out: &mut Vec<f32>, value: &Unknown, components: usize) {
    out.clear();
    let source = unknown_number_array(value);
    let first = source.first().copied().flatten().unwrap_or(0.0);
    out.extend((0..components).map(|index| {
        let candidate = source.get(index).copied().flatten().unwrap_or(first);
        return if candidate.is_finite() {
            candidate
        } else {
            0.0
        };
    }));
}

// flight-lint: allow(conform-array) D9 array negotiation: TS readonly number[] maps to the canonical &[f32] slice lane
pub fn lottie_rgba(color: &[f32]) -> u32 {
    let component = |index: usize| -> u32 {
        return (lottie_clamp(color.get(index).copied().unwrap_or(0.0), 0.0, 1.0) * 255.0).round()
            as u32;
    };
    return (component(0) << 24) | (component(1) << 16) | (component(2) << 8) | 0xff;
}

// flight-lint: allow(f64) serde_json exposes authored JSON numbers as f64 before the approved D1 f32 conversion
fn number_from_json(value: &Value) -> f32 {
    return match value {
        Value::Bool(value) => {
            if *value {
                1.0
            } else {
                0.0
            }
        }
        Value::Null => 0.0,
        Value::Number(value) => value.as_f64().unwrap_or(f64::NAN) as f32,
        Value::String(value) => number_from_text(value),
        Value::Array(values) if values.is_empty() => 0.0,
        Value::Array(values) if values.len() == 1 => number_from_json(&values[0]),
        _ => f32::NAN,
    };
}

fn number_from_text(value: &str) -> f32 {
    let value = value.trim();
    if value.is_empty() {
        return 0.0;
    }
    return value.parse::<f32>().unwrap_or(f32::NAN);
}

fn parse_lottie_document(source: &Value) -> Option<LottieDocument> {
    let value = match source {
        Value::Object(value) => Value::Object(value.clone()),
        Value::String(value) => serde_json::from_str(value).ok()?,
        _ => return None,
    };
    return value.as_object().cloned().map(LottieRecord::from);
}

fn record_array<'a>(record: &'a LottieRecord, key: &str) -> &'a [Value] {
    return record
        .get(key)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[]);
}

fn record_f32(record: &LottieRecord, key: &str, fallback: f32) -> f32 {
    return value_f32(record.get(key), fallback);
}

fn record_i32(record: &LottieRecord, key: &str, fallback: i32) -> i32 {
    return record
        .get(key)
        .and_then(Value::as_i64)
        .map(|value| value as i32)
        .unwrap_or(fallback);
}

pub fn report_lottie_drop(
    context: &mut LottieImportContext<'_>,
    kind: &str,
    origin: &str,
    detail: Option<HashMap<String, ImportDiagnosticDetailValue>>,
) {
    report_import_diagnostic(
        context.diagnostics.as_deref_mut(),
        ImportDiagnosticSeverity::Drop,
        kind,
        origin,
        detail,
    );
}

// flight-lint: allow(contract-vocabulary) serde_json::Value is the traversable representation of the source unknown property tree
pub fn report_lottie_expression(value: Option<&Value>, context: &mut LottieImportContext<'_>) {
    let Some(value) = value else {
        return;
    };
    if value.get("x").and_then(Value::as_str).is_some() {
        report_lottie_skip(
            context,
            "lottie.unsupported-expression",
            "reportLottieExpression",
            None,
        );
    }
    match value {
        Value::Array(values) => {
            for child in values {
                report_lottie_expression(Some(child), context);
            }
        }
        Value::Object(values) => {
            for child in values.values() {
                report_lottie_expression(Some(child), context);
            }
        }
        _ => {}
    }
}

pub fn report_lottie_skip(
    context: &mut LottieImportContext<'_>,
    kind: &str,
    origin: &str,
    detail: Option<HashMap<String, ImportDiagnosticDetailValue>>,
) {
    report_import_diagnostic(
        context.diagnostics.as_deref_mut(),
        ImportDiagnosticSeverity::Skip,
        kind,
        origin,
        detail,
    );
}

fn sample_lottie_spatial_bezier(
    start: &[f32],
    end: &[f32],
    outgoing: &[f32],
    incoming: &[f32],
    time: f32,
) -> Vec<f32> {
    let inverse = 1.0 - time;
    return start
        .iter()
        .enumerate()
        .map(|(component, value)| {
            inverse.powi(3) * value
                + 3.0 * inverse.powi(2) * time * (value + outgoing[component])
                + 3.0 * inverse * time.powi(2) * (end[component] + incoming[component])
                + time.powi(3) * end[component]
        })
        .collect();
}

fn spatial_tangent(
    value: Option<&Value>,
    components: usize,
    tangent_of: &LottieTangentOf,
) -> Option<Vec<f32>> {
    value?.as_array()?;
    return Some(
        lottie_numeric_json_value(value, components)
            .into_iter()
            .enumerate()
            .map(|(component, value)| tangent_of(value, component))
            .collect(),
    );
}

// flight-lint: allow(f64) Unknown can carry authored JSON and Rust f64 values before the approved D1 f32 conversion
fn unknown_number(value: &UnknownValue) -> Option<f32> {
    if let Some(value) = value.downcast_ref::<f32>() {
        return Some(*value);
    }
    if let Some(value) = value.downcast_ref::<f64>() {
        return Some(*value as f32);
    }
    if let Some(value) = value.downcast_ref::<i32>() {
        return Some(*value as f32);
    }
    if let Some(value) = value.downcast_ref::<u32>() {
        return Some(*value as f32);
    }
    if let Some(value) = value.downcast_ref::<bool>() {
        return Some(if *value { 1.0 } else { 0.0 });
    }
    if let Some(value) = value.downcast_ref::<String>() {
        return Some(number_from_text(value));
    }
    if let Some(value) = value.downcast_ref::<Value>() {
        return Some(number_from_json(value));
    }
    return None;
}

fn unknown_number_array(value: &Unknown) -> Vec<Option<f32>> {
    let Some(value) = value else {
        return Vec::new();
    };
    if let Some(values) = value.downcast_ref::<Vec<f32>>() {
        return values.iter().copied().map(Some).collect();
    }
    if let Some(values) = value.downcast_ref::<Vec<i32>>() {
        return values.iter().map(|value| Some(*value as f32)).collect();
    }
    if let Some(values) = value.downcast_ref::<Value>().and_then(Value::as_array) {
        return values
            .iter()
            .map(|value| {
                if value.is_null() {
                    None
                } else {
                    Some(number_from_json(value))
                }
            })
            .collect();
    }
    return vec![unknown_number(value)];
}

// flight-lint: allow(f64) serde_json exposes authored JSON numbers as f64 before the approved D1 f32 conversion
fn value_f32(value: Option<&Value>, fallback: f32) -> f32 {
    return value
        .and_then(Value::as_f64)
        .map(|value| value as f32)
        .unwrap_or(fallback);
}

fn value_to_lottie_record(value: &Value) -> Option<LottieRecord> {
    return value.as_object().cloned().map(LottieRecord::from);
}
