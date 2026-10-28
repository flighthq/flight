use crate::collada_types::*;
use crate::collada_xml::{collada_child, collada_descendants, collada_id_of, collada_numbers};
use crate::obj_features::is_obj_whitespace;
use flight_animation::{AnimationInterpolation, create_animation_track};
use flight_entity::Ref;
use flight_geometry::contract::{
    create_matrix4, create_transform3d, decompose_matrix4_to_transform3d,
};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_scene3d::{
    Scene3DAnimationPath, Scene3DDocumentAnimation, Scene3DDocumentAnimationChannel,
};
use flight_xml::{XmlElement, parse_xml_document};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

struct AnimationSource {
    key: String,
    names: Vec<String>,
    numbers: Vec<f32>,
}

pub static COLLADA_ANIMATION_DECODER: LazyLock<Ref<ColladaElementDecoder>> = LazyLock::new(|| {
    Arc::new(RwLock::new(ColladaElementDecoder {
        build: Some(Arc::new(resolve_animations)),
        build_phase: Some(40.0),
        decode: Arc::new(|context| {
            let (root, diagnostics, channels) = {
                let context = context.read().unwrap();
                (
                    context.root.clone(),
                    context.diagnostics.clone(),
                    context.animation_channels.clone(),
                )
            };
            let decoded =
                decode_animations_from_root(&root, Some(&mut diagnostics.write().unwrap()));
            channels.write().unwrap().extend(decoded);
        }),
        elements: vec!["animation".to_string()],
        features: vec!["Animation".to_string()],
    }))
});

fn create_collada_track(
    times: &[f32],
    values: Vec<f32>,
    components: usize,
    interpolation: AnimationInterpolation,
    quaternion: bool,
) -> Ref<flight_animation::AnimationTrack> {
    let mut track = create_animation_track();
    track.times = times.to_vec();
    track.values = values;
    track.components = components;
    track.interpolation = interpolation;
    track.quaternion = quaternion;
    return Arc::new(RwLock::new(track));
}

fn animation_diagnostic(
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    severity: ImportDiagnosticSeverity,
    kind: &str,
    origin: &str,
    detail: HashMap<String, ImportDiagnosticDetailValue>,
) {
    report_import_diagnostic(diagnostics, severity, kind, origin, Some(detail));
}

fn decode_animations_from_root(
    root: &Ref<XmlElement>,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Vec<Ref<ColladaDecodedAnimationChannel>> {
    let mut out = Vec::new();
    let mut animations = Vec::new();
    collada_descendants(&mut animations, root, "animation");
    for animation in animations {
        let mut sources: Vec<AnimationSource> = Vec::new();
        for source in &animation.read().unwrap().children {
            if source.read().unwrap().name != "source" {
                continue;
            }
            let id = collada_id_of(source).filter(|id| !id.is_empty());
            let array = collada_child(Some(source), "float_array")
                .or_else(|| collada_child(Some(source), "Name_array"));
            if let (Some(id), Some(array)) = (id, array) {
                let numeric = array.read().unwrap().name == "float_array";
                let entry = AnimationSource {
                    key: id.clone(),
                    numbers: if numeric {
                        collada_numbers(Some(&array))
                    } else {
                        Vec::new()
                    },
                    names: if numeric {
                        Vec::new()
                    } else {
                        array
                            .read()
                            .unwrap()
                            .text
                            .trim_matches(is_obj_whitespace)
                            .split(is_obj_whitespace)
                            .filter(|token| !token.is_empty())
                            .map(str::to_string)
                            .collect()
                    },
                };
                if let Some(old) = sources.iter_mut().find(|entry| entry.key == id) {
                    *old = entry;
                } else {
                    sources.push(entry);
                }
            }
        }
        let sampler = collada_child(Some(&animation), "sampler");
        let channel = collada_child(Some(&animation), "channel");
        let (Some(sampler), Some(channel)) = (sampler, channel) else {
            animation_diagnostic(
                diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Recover,
                "collada.missing-reference",
                "decodeColladaAnimations",
                HashMap::from([(
                    "element".to_string(),
                    ImportDiagnosticDetailValue::String("sampler/channel".to_string()),
                )]),
            );
            continue;
        };
        let input = input_source(&sampler, "INPUT");
        let output = input_source(&sampler, "OUTPUT");
        let interpolation = input_source(&sampler, "INTERPOLATION");
        let times = sources
            .iter()
            .find(|entry| entry.key == input)
            .map(|entry| entry.numbers.clone())
            .unwrap_or_default();
        let values = sources
            .iter()
            .find(|entry| entry.key == output)
            .map(|entry| entry.numbers.clone())
            .unwrap_or_default();
        let interpolation = sources
            .iter()
            .find(|entry| entry.key == interpolation)
            .map(|entry| entry.names.clone())
            .unwrap_or_default();
        for mode in &interpolation {
            if !matches!(mode.as_str(), "LINEAR" | "STEP" | "BEZIER") {
                animation_diagnostic(
                    diagnostics.as_deref_mut(),
                    ImportDiagnosticSeverity::Skip,
                    "collada.unsupported-interpolation",
                    "decodeColladaAnimations",
                    HashMap::from([(
                        "interpolation".to_string(),
                        ImportDiagnosticDetailValue::String(mode.clone()),
                    )]),
                );
            }
        }
        if times.is_empty() || values.is_empty() {
            animation_diagnostic(
                diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Recover,
                "collada.missing-reference",
                "decodeColladaAnimations",
                HashMap::from([(
                    "element".to_string(),
                    ImportDiagnosticDetailValue::String("animation source".to_string()),
                )]),
            );
            continue;
        }
        let target = channel
            .read()
            .unwrap()
            .attributes
            .get("target")
            .cloned()
            .unwrap_or_default();
        out.push(Arc::new(RwLock::new(ColladaDecodedAnimationChannel {
            target,
            times,
            values,
            interpolation,
            in_tangents: Vec::new(),
            out_tangents: Vec::new(),
        })));
    }
    return out;
}

pub fn decode_collada_animations(
    xml: &str,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Vec<Ref<ColladaDecodedAnimationChannel>> {
    let Some(root) = parse_xml_document(xml) else {
        return Vec::new();
    };
    return decode_animations_from_root(&Arc::new(RwLock::new(root)), diagnostics);
}

fn input_source(sampler: &Ref<XmlElement>, semantic: &str) -> String {
    return sampler
        .read()
        .unwrap()
        .children
        .iter()
        .find(|entry| {
            let entry = entry.read().unwrap();
            entry.name == "input"
                && entry.attributes.get("semantic").map(String::as_str) == Some(semantic)
        })
        .and_then(|entry| entry.read().unwrap().attributes.get("source").cloned())
        .map(|source| source.strip_prefix('#').unwrap_or(&source).to_string())
        .unwrap_or_default();
}

fn map_interpolation(modes: &[String]) -> AnimationInterpolation {
    return if modes.first().map(String::as_str) == Some("STEP")
        && modes.iter().all(|mode| mode == &modes[0])
    {
        AnimationInterpolation::Step
    } else {
        AnimationInterpolation::Linear
    };
}

fn resolve_animations(context: &Ref<ColladaBuildContext>) {
    let context = context.read().unwrap();
    let (document, channels, diagnostics) = {
        let parse = context.parse.read().unwrap();
        (
            parse.document.clone(),
            parse.animation_channels.clone(),
            parse.diagnostics.clone(),
        )
    };
    let channels = channels.read().unwrap();
    if channels.is_empty() {
        return;
    }
    let mut resolved = Vec::new();
    let mut duration = 0.0f32;
    let mut scratch = create_matrix4();
    for channel in &*channels {
        let channel = channel.read().unwrap();
        let Some((node_id, property)) = channel.target.split_once('/') else {
            animation_diagnostic(
                Some(&mut diagnostics.write().unwrap()),
                ImportDiagnosticSeverity::Skip,
                "collada.unsupported-animation-target",
                "parseCollada",
                HashMap::from([(
                    "target".to_string(),
                    ImportDiagnosticDetailValue::String(channel.target.clone()),
                )]),
            );
            continue;
        };
        let Some(node_index) = context
            .node_id_map
            .iter()
            .find(|entry| entry.key == node_id)
            .map(|entry| entry.value)
        else {
            animation_diagnostic(
                Some(&mut diagnostics.write().unwrap()),
                ImportDiagnosticSeverity::Drop,
                "collada.animation-target-unresolved",
                "parseCollada",
                HashMap::from([(
                    "target".to_string(),
                    ImportDiagnosticDetailValue::String(channel.target.clone()),
                )]),
            );
            continue;
        };
        let interpolation = map_interpolation(&channel.interpolation);
        let max_time = channel.times.last().copied().unwrap_or(0.0);
        if matches!(property, "matrix" | "transform") {
            if channel.values.len() < channel.times.len() * 16 {
                animation_diagnostic(
                    Some(&mut diagnostics.write().unwrap()),
                    ImportDiagnosticSeverity::Drop,
                    "collada.animation-cardinality",
                    "parseCollada",
                    HashMap::from([
                        (
                            "target".to_string(),
                            ImportDiagnosticDetailValue::String(channel.target.clone()),
                        ),
                        (
                            "expected".to_string(),
                            ImportDiagnosticDetailValue::Number((channel.times.len() * 16) as f32),
                        ),
                        (
                            "actual".to_string(),
                            ImportDiagnosticDetailValue::Number(channel.values.len() as f32),
                        ),
                    ]),
                );
                continue;
            }
            let mut translations = Vec::new();
            let mut rotations = Vec::new();
            let mut scales = Vec::new();
            for key in 0..channel.times.len() {
                for row in 0..4 {
                    for column in 0..4 {
                        scratch.m[column * 4 + row] = channel.values[key * 16 + row * 4 + column];
                    }
                }
                let mut transform = create_transform3d();
                decompose_matrix4_to_transform3d(&mut transform, &scratch);
                translations.extend([
                    transform.position.x,
                    transform.position.y,
                    transform.position.z,
                ]);
                rotations.extend([
                    transform.rotation.x,
                    transform.rotation.y,
                    transform.rotation.z,
                    transform.rotation.w,
                ]);
                scales.extend([transform.scale.x, transform.scale.y, transform.scale.z]);
            }
            for (path, values, components, quaternion) in [
                (Scene3DAnimationPath::Translation, translations, 3, false),
                (Scene3DAnimationPath::Rotation, rotations, 4, true),
                (Scene3DAnimationPath::Scale, scales, 3, false),
            ] {
                resolved.push(Scene3DDocumentAnimationChannel {
                    node: node_index,
                    path,
                    track: create_collada_track(
                        &channel.times,
                        values,
                        components,
                        interpolation,
                        quaternion,
                    ),
                });
            }
        } else {
            let (path, components, quaternion, values) =
                if matches!(property, "translate" | "translation") {
                    (
                        Scene3DAnimationPath::Translation,
                        3,
                        false,
                        channel.values.clone(),
                    )
                } else if property == "scale" {
                    (
                        Scene3DAnimationPath::Scale,
                        3,
                        false,
                        channel.values.clone(),
                    )
                } else if let Some(axis_name) = property.strip_suffix(".ANGLE") {
                    let axis = match axis_name {
                        "rotateX" | "rotationX" => [1.0, 0.0, 0.0],
                        "rotateY" | "rotationY" => [0.0, 1.0, 0.0],
                        "rotateZ" | "rotationZ" => [0.0, 0.0, 1.0],
                        _ => {
                            animation_diagnostic(
                                Some(&mut diagnostics.write().unwrap()),
                                ImportDiagnosticSeverity::Skip,
                                "collada.unsupported-animation-target",
                                "parseCollada",
                                HashMap::from([(
                                    "target".to_string(),
                                    ImportDiagnosticDetailValue::String(channel.target.clone()),
                                )]),
                            );
                            continue;
                        }
                    };
                    let mut values = Vec::new();
                    for value in &channel.values {
                        let half = ((*value * std::f32::consts::PI) / 180.0) * 0.5;
                        let sine = half.sin();
                        values.extend([axis[0] * sine, axis[1] * sine, axis[2] * sine, half.cos()]);
                    }
                    (Scene3DAnimationPath::Rotation, 4, true, values)
                } else {
                    animation_diagnostic(
                        Some(&mut diagnostics.write().unwrap()),
                        ImportDiagnosticSeverity::Skip,
                        "collada.unsupported-animation-target",
                        "parseCollada",
                        HashMap::from([(
                            "target".to_string(),
                            ImportDiagnosticDetailValue::String(channel.target.clone()),
                        )]),
                    );
                    continue;
                };
            resolved.push(Scene3DDocumentAnimationChannel {
                node: node_index,
                path,
                track: create_collada_track(
                    &channel.times,
                    values,
                    components,
                    interpolation,
                    quaternion,
                ),
            });
        }
        duration = if duration.is_nan() || max_time.is_nan() {
            f32::NAN
        } else {
            duration.max(max_time)
        };
    }
    if !resolved.is_empty() {
        document
            .write()
            .unwrap()
            .animations
            .push(Scene3DDocumentAnimation {
                channels: resolved,
                duration,
                name: None,
            });
    }
}
