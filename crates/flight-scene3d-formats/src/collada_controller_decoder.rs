use crate::collada_parse::report_collada_diagnostic;
use crate::collada_scene_shared::apply_collada_material_overrides;
use crate::collada_types::*;
use crate::collada_xml::{collada_child, collada_descendants, collada_id_of, collada_numbers};
use crate::obj_features::is_obj_whitespace;
use crate::stl_features::parse_stl_number;
use flight_entity::Ref;
use flight_geometry::create_matrix4;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_meshgeometry::{MeshMorph, MeshMorphTarget};
use flight_scene3d::Scene3DDocumentSkin;
use flight_xml::{XmlElement, parse_xml_document};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

struct ControllerSource {
    key: String,
    names: Vec<String>,
    numbers: Vec<f32>,
}

pub static COLLADA_CONTROLLER_DECODER: LazyLock<Ref<ColladaElementDecoder>> = LazyLock::new(|| {
    Arc::new(RwLock::new(ColladaElementDecoder {
        build: Some(Arc::new(resolve_skins)),
        build_phase: Some(30.0),
        decode: Arc::new(|context| {
            let (root, diagnostics, skins, morphs) = {
                let context = context.read().unwrap();
                (
                    context.root.clone(),
                    context.diagnostics.clone(),
                    context.skins.clone(),
                    context.morphs.clone(),
                )
            };
            let decoded = decode_skins_from_root(&root, Some(&mut diagnostics.write().unwrap()));
            for skin in decoded {
                let id = skin.read().unwrap().controller_id.clone();
                let mut skins = skins.write().unwrap();
                if let Some(entry) = skins.iter_mut().find(|entry| entry.key == id) {
                    entry.value = skin;
                } else {
                    skins.push(ColladaSkinEntry {
                        key: id,
                        value: skin,
                    });
                }
            }
            let decoded = decode_morphs_from_root(&root, Some(&mut diagnostics.write().unwrap()));
            for morph in decoded {
                let id = morph.read().unwrap().controller_id.clone();
                let mut morphs = morphs.write().unwrap();
                if let Some(entry) = morphs.iter_mut().find(|entry| entry.key == id) {
                    entry.value = morph;
                } else {
                    morphs.push(ColladaMorphEntry {
                        key: id,
                        value: morph,
                    });
                }
            }
        }),
        elements: vec!["controller".to_string()],
        features: vec!["Controller", "Controller.Morph", "Controller.Skin"]
            .into_iter()
            .map(str::to_string)
            .collect(),
    }))
});

// flight-lint: allow(f64) standing exact-integer rule: preserve source Number fractional/nonfinite/negative array-index validity until the final integer lookup, no attribute widening
fn array_index(value: f64) -> Option<usize> {
    return (value.is_finite() && value >= 0.0 && value.fract() == 0.0).then_some(value as usize);
}

fn build_mesh_morph(
    morph: &ColladaDecodedMorph,
    geometry_positions: &[ColladaFloatArrayEntry],
    diagnostics: &Ref<Vec<ImportDiagnostic>>,
) -> Option<MeshMorph> {
    let Some(base) = geometry_positions
        .iter()
        .find(|entry| entry.key == morph.base_geometry)
    else {
        report_collada_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Recover,
            "collada.missing-reference",
            "parseCollada",
            Some(HashMap::from([
                (
                    "element".to_string(),
                    ImportDiagnosticDetailValue::String("morph base geometry".to_string()),
                ),
                (
                    "geometry".to_string(),
                    ImportDiagnosticDetailValue::String(morph.base_geometry.clone()),
                ),
            ])),
        );
        return None;
    };
    let base = base.value.read().unwrap();
    let count = base.len() / 3;
    let mut targets = Vec::new();
    for id in &morph.targets {
        let Some(target) = geometry_positions.iter().find(|entry| entry.key == *id) else {
            report_collada_diagnostic(
                diagnostics,
                ImportDiagnosticSeverity::Recover,
                "collada.missing-reference",
                "parseCollada",
                Some(HashMap::from([
                    (
                        "element".to_string(),
                        ImportDiagnosticDetailValue::String("morph target geometry".to_string()),
                    ),
                    (
                        "geometry".to_string(),
                        ImportDiagnosticDetailValue::String(id.clone()),
                    ),
                ])),
            );
            continue;
        };
        let target = target.value.read().unwrap();
        let mut deltas = Vec::with_capacity(count * 3);
        for i in 0..count * 3 {
            let value = target.get(i).copied().unwrap_or(0.0);
            deltas.push(if morph.method == ColladaMorphMethod::Normalized {
                value - base[i]
            } else {
                value
            });
        }
        targets.push(MeshMorphTarget {
            normal_deltas: None,
            position_deltas: deltas.into_boxed_slice(),
            tangent_deltas: None,
        });
    }
    if targets.is_empty() {
        return None;
    }
    let count = targets.len();
    return Some(MeshMorph {
        targets: Arc::new(targets),
        weights: morph
            .weights
            .iter()
            .take(count)
            .copied()
            .collect::<Vec<_>>()
            .into_boxed_slice(),
    });
}

// flight-lint: allow(f64) standing exact-integer rule: source Number index metadata cannot narrow to f32 before array validity/count decisions
fn controller_indices(element: Option<&Ref<XmlElement>>) -> Vec<f64> {
    let Some(element) = element else {
        return Vec::new();
    };
    return tokens(&element.read().unwrap().text)
        .iter()
        .map(|token| parse_stl_number(token))
        .filter(|value| value.is_finite())
        .collect();
}

// flight-lint: allow(f64) standing exact-integer rule: preserve strict Number fractional/nonfinite offset semantics until the final integer lookup
fn controller_offset(value: Option<&str>, fallback: &str) -> f64 {
    return parse_stl_number(value.unwrap_or(fallback));
}

// flight-lint: allow(f64) existing strict Number finite classification before canonical f32 weight write; no double arithmetic
fn controller_weight(token: &str) -> Option<f32> {
    let value = parse_stl_number(token);
    return value.is_finite().then_some(value as f32);
}

pub fn decode_collada_controllers(
    xml: &str,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Vec<Ref<ColladaDecodedSkin>> {
    let Some(root) = parse_xml_document(xml) else {
        return Vec::new();
    };
    return decode_skins_from_root(&Arc::new(RwLock::new(root)), diagnostics);
}

pub fn decode_collada_morphs(
    xml: &str,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Vec<Ref<ColladaDecodedMorph>> {
    let Some(root) = parse_xml_document(xml) else {
        return Vec::new();
    };
    return decode_morphs_from_root(&Arc::new(RwLock::new(root)), diagnostics);
}

fn decode_morphs_from_root(
    root: &Ref<XmlElement>,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Vec<Ref<ColladaDecodedMorph>> {
    let mut out = Vec::new();
    let mut controllers = Vec::new();
    collada_descendants(&mut controllers, root, "controller");
    for controller in controllers {
        let Some(morph) = collada_child(Some(&controller), "morph") else {
            continue;
        };
        let Some(id) = collada_id_of(&controller).filter(|id| !id.is_empty()) else {
            continue;
        };
        let method = morph.read().unwrap().attributes.get("method").cloned();
        if let Some(method) = method.as_ref().filter(|method| {
            !method.is_empty() && !matches!(method.as_str(), "RELATIVE" | "NORMALIZED")
        }) {
            report_import_diagnostic(
                diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Skip,
                "collada.unsupported-morph-method",
                "decodeColladaMorphs",
                Some(HashMap::from([(
                    "method".to_string(),
                    ImportDiagnosticDetailValue::String(method.clone()),
                )])),
            );
        }
        let targets_element = collada_child(Some(&morph), "targets");
        let target_source = input_attribute(targets_element.as_ref(), "MORPH_TARGET", "source");
        let weight_source = input_attribute(targets_element.as_ref(), "MORPH_WEIGHT", "source");
        let target_ids = morph_source(&morph, target_source.as_deref(), "IDREF_array");
        let weight_tokens = morph_source(&morph, weight_source.as_deref(), "float_array");
        let weights = weight_tokens
            .iter()
            .filter_map(|token| controller_weight(token))
            .take(target_ids.len())
            .collect::<Vec<_>>();
        if target_ids.is_empty() || weights.is_empty() {
            report_import_diagnostic(
                diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Recover,
                "collada.missing-reference",
                "decodeColladaMorphs",
                Some(HashMap::from([(
                    "controller".to_string(),
                    ImportDiagnosticDetailValue::String(id),
                )])),
            );
            continue;
        }
        let source = morph
            .read()
            .unwrap()
            .attributes
            .get("source")
            .cloned()
            .unwrap_or_default();
        out.push(Arc::new(RwLock::new(ColladaDecodedMorph {
            controller_id: id,
            base_geometry: source.strip_prefix('#').unwrap_or(&source).to_string(),
            method: if method.as_deref() == Some("NORMALIZED") {
                ColladaMorphMethod::Normalized
            } else {
                ColladaMorphMethod::Relative
            },
            targets: target_ids,
            weights,
        })));
    }
    return out;
}

// flight-lint: allow(f64) standing exact-integer rule: source Number vertex counts/offsets/indices retain exact control-flow and final influence counts; public weights and matrices remain f32
fn decode_skins_from_root(
    root: &Ref<XmlElement>,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Vec<Ref<ColladaDecodedSkin>> {
    let mut out = Vec::new();
    let mut controllers = Vec::new();
    collada_descendants(&mut controllers, root, "controller");
    for controller in controllers {
        let Some(skin) = collada_child(Some(&controller), "skin") else {
            continue;
        };
        let Some(id) = collada_id_of(&controller).filter(|id| !id.is_empty()) else {
            continue;
        };
        let geometry = skin
            .read()
            .unwrap()
            .attributes
            .get("source")
            .cloned()
            .unwrap_or_default();
        let mut sources: Vec<ControllerSource> = Vec::new();
        for source in &skin.read().unwrap().children {
            if source.read().unwrap().name != "source" {
                continue;
            }
            let Some(id) = collada_id_of(source).filter(|id| !id.is_empty()) else {
                continue;
            };
            let array = collada_child(Some(source), "Name_array")
                .or_else(|| collada_child(Some(source), "IDREF_array"))
                .or_else(|| collada_child(Some(source), "float_array"));
            if let Some(array) = array {
                let numeric = array.read().unwrap().name == "float_array";
                let entry = ControllerSource {
                    key: id.clone(),
                    numbers: if numeric {
                        collada_numbers(Some(&array))
                    } else {
                        Vec::new()
                    },
                    names: if numeric {
                        Vec::new()
                    } else {
                        tokens(&array.read().unwrap().text)
                    },
                };
                if let Some(old) = sources.iter_mut().find(|entry| entry.key == id) {
                    *old = entry;
                } else {
                    sources.push(entry);
                }
            }
        }
        let joints = collada_child(Some(&skin), "joints");
        let joint_ref = input_attribute(joints.as_ref(), "JOINT", "source").unwrap_or_default();
        let matrix_ref =
            input_attribute(joints.as_ref(), "INV_BIND_MATRIX", "source").unwrap_or_default();
        let joint_names = sources
            .iter()
            .find(|entry| entry.key == joint_ref.strip_prefix('#').unwrap_or(&joint_ref))
            .map(|entry| entry.names.clone())
            .unwrap_or_default();
        let inverse_bind = sources
            .iter()
            .find(|entry| entry.key == matrix_ref.strip_prefix('#').unwrap_or(&matrix_ref))
            .map(|entry| {
                entry
                    .numbers
                    .chunks_exact(16)
                    .map(|chunk| chunk.to_vec())
                    .collect()
            })
            .unwrap_or_default();
        let weights = collada_child(Some(&skin), "vertex_weights");
        let counts = controller_indices(collada_child(weights.as_ref(), "vcount").as_ref());
        let values = controller_indices(collada_child(weights.as_ref(), "v").as_ref());
        let joint_offset = controller_offset(
            input_attribute(weights.as_ref(), "JOINT", "offset").as_deref(),
            "0",
        );
        let weight_offset = controller_offset(
            input_attribute(weights.as_ref(), "WEIGHT", "offset").as_deref(),
            "1",
        );
        let mut stride = 1.0f64;
        if let Some(weights) = &weights {
            for input in &weights.read().unwrap().children {
                let input = input.read().unwrap();
                if input.name != "input" {
                    continue;
                }
                let offset =
                    controller_offset(input.attributes.get("offset").map(String::as_str), "0")
                        + 1.0;
                stride = if stride.is_nan() || offset.is_nan() {
                    f64::NAN
                } else {
                    stride.max(offset)
                };
            }
        }
        let weight_ref = input_attribute(weights.as_ref(), "WEIGHT", "source").unwrap_or_default();
        let weight_source = sources
            .iter()
            .find(|entry| entry.key == weight_ref.strip_prefix('#').unwrap_or(&weight_ref))
            .map(|entry| entry.numbers.as_slice())
            .unwrap_or(&[]);
        let mut influences = Vec::new();
        let mut cursor = 0.0;
        for count in counts {
            let mut row = Vec::new();
            let mut i = 0.0;
            while i < count {
                let ji = array_index(cursor + i * stride + joint_offset)
                    .and_then(|index| values.get(index))
                    .and_then(|value| array_index(*value))
                    .and_then(|index| joint_names.get(index));
                let wi = array_index(cursor + i * stride + weight_offset)
                    .and_then(|index| values.get(index))
                    .and_then(|value| array_index(*value))
                    .and_then(|index| weight_source.get(index));
                if let (Some(joint), Some(weight)) = (ji, wi) {
                    row.push(ColladaSkinInfluence {
                        joint: joint.clone(),
                        weight: *weight,
                    });
                }
                i += 1.0;
            }
            let sum = row
                .iter()
                .fold(0.0, |sum, influence| sum + influence.weight);
            for influence in &mut row {
                influence.weight = if sum > 0.0 {
                    influence.weight / sum
                } else {
                    0.0
                };
            }
            influences.push(row);
            cursor += count * stride;
        }
        if cursor != values.len() as f64 {
            report_import_diagnostic(
                diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Recover,
                "collada.vertex-weight-count-mismatch",
                "decodeColladaControllers",
                Some(HashMap::from([(
                    "controller".to_string(),
                    ImportDiagnosticDetailValue::String(id.clone()),
                )])),
            );
        }
        out.push(Arc::new(RwLock::new(ColladaDecodedSkin {
            bind_shape_matrix: collada_numbers(
                collada_child(Some(&skin), "bind_shape_matrix").as_ref(),
            ),
            controller_id: id,
            geometry_ref: geometry.strip_prefix('#').unwrap_or(&geometry).to_string(),
            influences,
            inverse_bind_matrices: inverse_bind,
            joint_sids: joint_names.clone(),
            joint_names,
        })));
    }
    return out;
}

fn input_attribute(
    element: Option<&Ref<XmlElement>>,
    semantic: &str,
    attribute: &str,
) -> Option<String> {
    return element?
        .read()
        .unwrap()
        .children
        .iter()
        .find(|input| {
            let input = input.read().unwrap();
            input.name == "input"
                && input.attributes.get("semantic").map(String::as_str) == Some(semantic)
        })
        .and_then(|input| input.read().unwrap().attributes.get(attribute).cloned());
}

fn morph_source(morph: &Ref<XmlElement>, source: Option<&str>, name: &str) -> Vec<String> {
    let Some(source) = source else {
        return Vec::new();
    };
    let id = source.strip_prefix('#').unwrap_or(source);
    let mut sources = Vec::new();
    collada_descendants(&mut sources, morph, "source");
    let Some(source) = sources
        .into_iter()
        .find(|source| collada_id_of(source).as_deref() == Some(id))
    else {
        return Vec::new();
    };
    let array = source
        .read()
        .unwrap()
        .children
        .iter()
        .find(|entry| entry.read().unwrap().name == name)
        .cloned();
    return array
        .map(|array| tokens(&array.read().unwrap().text))
        .unwrap_or_default();
}

fn resolve_skins(context: &Ref<ColladaBuildContext>) {
    let context = context.read().unwrap();
    let parse = context.parse.read().unwrap();
    let mut document = parse.document.write().unwrap();
    let skins = parse.skins.read().unwrap();
    let morphs = parse.morphs.read().unwrap();
    let geometries = parse.geometry_id_to_mesh_index.read().unwrap();
    let positions = parse.geometry_positions.read().unwrap();
    let symbols = parse.geometry_primitive_symbols.read().unwrap();
    for binding in &context.deferred_controllers {
        let skin = skins
            .iter()
            .find(|entry| entry.key == binding.controller_id)
            .map(|entry| entry.value.clone());
        let skin = skin.as_ref().map(|skin| skin.read().unwrap());
        let morph_id = skin
            .as_ref()
            .map_or(binding.controller_id.as_str(), |skin| {
                skin.geometry_ref.as_str()
            });
        let morph = morphs
            .iter()
            .find(|entry| entry.key == morph_id)
            .map(|entry| entry.value.clone());
        let morph = morph.as_ref().map(|morph| morph.read().unwrap());
        if skin.is_none() && morph.is_none() {
            report_collada_diagnostic(
                &parse.diagnostics,
                ImportDiagnosticSeverity::Recover,
                "collada.missing-reference",
                "parseCollada",
                Some(HashMap::from([
                    (
                        "element".to_string(),
                        ImportDiagnosticDetailValue::String("instance_controller".to_string()),
                    ),
                    (
                        "url".to_string(),
                        ImportDiagnosticDetailValue::String(format!("#{}", binding.controller_id)),
                    ),
                ])),
            );
            continue;
        }
        let geometry = morph
            .as_ref()
            .map(|morph| morph.base_geometry.as_str())
            .or_else(|| skin.as_ref().map(|skin| skin.geometry_ref.as_str()))
            .unwrap();
        let mut mesh = geometries
            .iter()
            .find(|entry| entry.key == geometry)
            .map(|entry| entry.value);
        if let Some(index) = mesh {
            let symbols = symbols
                .iter()
                .find(|entry| entry.key == geometry)
                .map(|entry| entry.value.read().unwrap());
            let index = apply_collada_material_overrides(
                &mut document,
                index,
                symbols.as_ref().map(|symbols| symbols.as_slice()),
                &binding.material_overrides,
            );
            document.nodes[binding.node_index as usize].mesh = Some(index);
            mesh = Some(index);
        }
        if let (Some(morph), Some(mesh)) = (&morph, mesh) {
            if let Some(morph) = build_mesh_morph(morph, &positions, &parse.diagnostics) {
                document.meshes[mesh as usize].morph = Some(Arc::new(RwLock::new(morph)));
            }
        }
        if let Some(skin) = skin {
            let mut joints = Vec::new();
            let mut inverse_bind = Vec::new();
            for (i, name) in skin.joint_names.iter().enumerate() {
                let Some(index) = context
                    .node_id_map
                    .iter()
                    .find(|entry| entry.key == *name)
                    .map(|entry| entry.value)
                else {
                    report_collada_diagnostic(
                        &parse.diagnostics,
                        ImportDiagnosticSeverity::Recover,
                        "collada.missing-reference",
                        "parseCollada",
                        Some(HashMap::from([
                            (
                                "element".to_string(),
                                ImportDiagnosticDetailValue::String("skin joint".to_string()),
                            ),
                            (
                                "joint".to_string(),
                                ImportDiagnosticDetailValue::String(name.clone()),
                            ),
                        ])),
                    );
                    continue;
                };
                joints.push(index);
                let mut matrix = create_matrix4();
                if let Some(row) = skin
                    .inverse_bind_matrices
                    .get(i)
                    .filter(|row| row.len() >= 16)
                {
                    for r in 0..4 {
                        for c in 0..4 {
                            matrix.m[c * 4 + r] = row[r * 4 + c];
                        }
                    }
                }
                inverse_bind.push(matrix);
            }
            let index = document.skins.len();
            document.skins.push(Scene3DDocumentSkin {
                joints,
                inverse_bind,
            });
            if let Some(mesh) = mesh {
                document.meshes[mesh as usize].skin = Some(index as i32);
            }
        }
    }
}

fn tokens(text: &str) -> Vec<String> {
    return text
        .trim_matches(is_obj_whitespace)
        .split(is_obj_whitespace)
        .filter(|token| !token.is_empty())
        .map(str::to_string)
        .collect();
}
