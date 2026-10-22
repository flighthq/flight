use crate::gltf_core_shared::{gltf_component_values, gltf_core_index, report_gltf_core_values};
use crate::gltf_types::{GltfCoreFeatureContext, GltfCoreFeatureHandler};
use flight_animation::{AnimationInterpolation, create_animation_track};
use flight_entity::Ref;
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_scene3d::{
    Scene3DAnimationPath, Scene3DDocumentAnimation, Scene3DDocumentAnimationChannel,
};
use std::sync::{Arc, LazyLock, RwLock};

pub static GLTF_ANIMATIONS_CORE_FEATURE_HANDLER: LazyLock<Ref<GltfCoreFeatureHandler>> =
    LazyLock::new(|| {
        Arc::new(RwLock::new(GltfCoreFeatureHandler {
            kind: "animations".to_string(),
            apply: Arc::new(apply_gltf_animations),
        }))
    });

fn append_gltf_weight_channels(
    context: &Ref<GltfCoreFeatureContext>,
    channels: &mut Vec<Scene3DDocumentAnimationChannel>,
    mesh_nodes: &[i32],
    times: &[f32],
    values: &[f32],
    interpolation: Option<&str>,
) {
    let document = context.read().unwrap().document.clone();
    let per_key = if interpolation == Some("CUBICSPLINE") {
        3
    } else {
        1
    };
    let mut bound = 0;
    let mut cardinality_dropped = false;
    for &node in mesh_nodes {
        let morph = {
            let document = document.read().unwrap();
            document
                .nodes
                .get(node as usize)
                .and_then(|node| node.mesh)
                .and_then(|mesh| document.meshes.get(mesh as usize))
                .and_then(|mesh| mesh.morph.clone())
        };
        let Some(morph) = morph else {
            continue;
        };
        let components = morph.read().unwrap().targets.len();
        if components == 0 {
            continue;
        }
        let expected = per_key * times.len() * components;
        if values.len() != expected {
            report_gltf_core_values(
                context,
                ImportDiagnosticSeverity::Drop,
                "gltf.weights-cardinality-mismatch",
                &[
                    (
                        "firstActual",
                        ImportDiagnosticDetailValue::Number(values.len() as f32),
                    ),
                    (
                        "firstExpected",
                        ImportDiagnosticDetailValue::Number(expected as f32),
                    ),
                ],
            );
            cardinality_dropped = true;
            continue;
        }
        let mut track = create_animation_track();
        track.components = components;
        track.interpolation =
            gltf_sampler_interpolation(interpolation).unwrap_or(AnimationInterpolation::Linear);
        track.times = times.to_vec();
        track.values = values.to_vec();
        channels.push(Scene3DDocumentAnimationChannel {
            node,
            path: Scene3DAnimationPath::Weights,
            track: Arc::new(RwLock::new(track)),
        });
        bound += 1;
    }
    if bound == 0 && !cardinality_dropped {
        report_gltf_core_values(
            context,
            ImportDiagnosticSeverity::Drop,
            "gltf.weights-no-morphable-mesh",
            &[],
        );
    }
}

fn apply_gltf_animations(context: &Ref<GltfCoreFeatureContext>) {
    let (
        source,
        document,
        node_indices,
        primitive_node_indices,
        read_accessor,
        report_accessor_fault,
    ) = {
        let context = context.read().unwrap();
        (
            context.source.clone(),
            context.document.clone(),
            context.node_indices.clone(),
            context.primitive_node_indices.clone(),
            context.read_accessor.clone(),
            context.report_accessor_fault.clone(),
        )
    };
    let animations = source
        .read()
        .unwrap()
        .animations
        .clone()
        .unwrap_or_default();
    let mut built = Vec::new();
    for (animation_index, animation) in animations.iter().enumerate() {
        let (source_channels, samplers, name) = {
            let animation = animation.read().unwrap();
            (
                animation.channels.clone(),
                animation.samplers.clone(),
                animation.name.clone(),
            )
        };
        let mut channels = Vec::new();
        let mut duration = 0.0_f32;
        for channel in source_channels {
            let (sampler_index, target) = {
                let channel = channel.read().unwrap();
                (channel.sampler, channel.target.clone())
            };
            let (node, path) = {
                let target = target.read().unwrap();
                (target.node, target.path.clone())
            };
            let mapped = node
                .and_then(gltf_core_index)
                .and_then(|node| node_indices.read().unwrap().get(node).copied());
            let Some(mapped) = mapped else {
                report_gltf_core_values(
                    context,
                    ImportDiagnosticSeverity::Drop,
                    "gltf.animation-target-unresolved",
                    &[(
                        "firstTarget",
                        ImportDiagnosticDetailValue::Number(node.unwrap_or(-1.0)),
                    )],
                );
                continue;
            };
            let sampler = gltf_core_index(sampler_index).and_then(|index| samplers.get(index));
            let Some(sampler) = sampler else {
                report_gltf_core_values(
                    context,
                    ImportDiagnosticSeverity::Drop,
                    "gltf.animation-missing-sampler",
                    &[(
                        "firstSampler",
                        ImportDiagnosticDetailValue::Number(sampler_index),
                    )],
                );
                continue;
            };
            let (input, output, interpolation) = {
                let sampler = sampler.read().unwrap();
                (sampler.input, sampler.output, sampler.interpolation.clone())
            };
            let input = read_accessor(input, Some("SCALAR"));
            let output_type = match path.as_str() {
                "rotation" => Some("VEC4"),
                "scale" | "translation" => Some("VEC3"),
                "weights" => Some("SCALAR"),
                _ => None,
            };
            let output = read_accessor(output, output_type);
            if let Some(fault) = input.fault.or(output.fault) {
                report_accessor_fault(ImportDiagnosticSeverity::Drop, &fault);
                continue;
            }
            if input.count == 0 || output.count == 0 {
                report_gltf_core_values(
                    context,
                    ImportDiagnosticSeverity::Drop,
                    "gltf.animation-sampler-empty",
                    &[(
                        "firstSampler",
                        ImportDiagnosticDetailValue::Number(sampler_index),
                    )],
                );
                continue;
            }
            let cubic = interpolation.as_deref() == Some("CUBICSPLINE");
            if path != "weights" && output.count != (if cubic { 3 } else { 1 }) * input.count {
                report_gltf_core_values(
                    context,
                    ImportDiagnosticSeverity::Drop,
                    "gltf.animation-sampler-cardinality",
                    &[(
                        "firstSampler",
                        ImportDiagnosticDetailValue::Number(sampler_index),
                    )],
                );
                continue;
            }
            let mut times = Vec::new();
            let mut values = Vec::new();
            gltf_component_values(&mut times, &input.data);
            gltf_component_values(&mut values, &output.data);
            let last = times.last().copied().unwrap_or(0.0);
            duration = if duration.is_nan() || last.is_nan() {
                f32::NAN
            } else {
                duration.max(last)
            };
            if path == "weights" {
                let expanded = node
                    .and_then(gltf_core_index)
                    .and_then(|node| primitive_node_indices.read().unwrap().get(node).cloned())
                    .map(|indices| indices.read().unwrap().clone())
                    .unwrap_or_default();
                let mesh_nodes = if expanded.is_empty() {
                    vec![mapped]
                } else {
                    expanded
                };
                append_gltf_weight_channels(
                    context,
                    &mut channels,
                    &mesh_nodes,
                    &times,
                    &values,
                    interpolation.as_deref(),
                );
                continue;
            }
            let path = match path.as_str() {
                "rotation" => Scene3DAnimationPath::Rotation,
                "scale" => Scene3DAnimationPath::Scale,
                "translation" => Scene3DAnimationPath::Translation,
                _ => {
                    report_gltf_core_values(
                        context,
                        ImportDiagnosticSeverity::Skip,
                        "gltf.animation-unsupported-path",
                        &[("firstPath", ImportDiagnosticDetailValue::String(path))],
                    );
                    continue;
                }
            };
            let quaternion = path == Scene3DAnimationPath::Rotation;
            let mut track = create_animation_track();
            track.components = if quaternion { 4 } else { 3 };
            track.interpolation = gltf_sampler_interpolation(interpolation.as_deref())
                .unwrap_or(AnimationInterpolation::Linear);
            track.quaternion = quaternion;
            track.times = times;
            track.values = values;
            channels.push(Scene3DDocumentAnimationChannel {
                node: mapped,
                path,
                track: Arc::new(RwLock::new(track)),
            });
        }
        if !channels.is_empty() {
            built.push(Scene3DDocumentAnimation {
                channels,
                duration,
                name: Some(name.unwrap_or_else(|| format!("animation{animation_index}"))),
            });
        }
    }
    document.write().unwrap().animations.extend(built);
}

fn gltf_sampler_interpolation(interpolation: Option<&str>) -> Option<AnimationInterpolation> {
    return match interpolation.unwrap_or("LINEAR") {
        "CUBICSPLINE" => Some(AnimationInterpolation::Cubic),
        "LINEAR" => Some(AnimationInterpolation::Linear),
        "STEP" => Some(AnimationInterpolation::Step),
        _ => None,
    };
}
