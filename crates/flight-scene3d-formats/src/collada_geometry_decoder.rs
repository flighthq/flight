use crate::collada_parse::{report_collada_diagnostic, set_collada_index};
use crate::collada_types::*;
use crate::collada_xml::{collada_child, collada_descendants, collada_id_of, collada_numbers};
use crate::obj_features::is_obj_whitespace;
use crate::shared::{CANONICAL_FLOATS_PER_VERTEX, CANONICAL_LAYOUT};
use crate::stl_features::parse_stl_number;
use flight_entity::Ref;
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_meshgeometry::{
    IndexBuffer, IndexBufferU32, MeshGeometryOptions, MeshSubset, PrimitiveTopology,
    create_mesh_geometry,
};
use flight_scene3d::Scene3DDocumentMesh;
use flight_xml::XmlElement;
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

pub static COLLADA_GEOMETRY_DECODER: LazyLock<Ref<ColladaElementDecoder>> = LazyLock::new(|| {
    Arc::new(RwLock::new(ColladaElementDecoder {
        build: None,
        build_phase: None,
        elements: vec!["geometry".to_string()],
        features: vec!["Geometry".to_string()],
        decode: Arc::new(decode_collada_geometry),
    }))
});

// flight-lint: allow(f64) Principal192423ac exact-integer limb: source Number slice bounds are index metadata, narrowed only at the final integer lookup
fn collada_slice(values: &[f64], start: f64, end: f64) -> Vec<f64> {
    let edge = |value: f64| {
        let value = value.trunc();
        if value < 0.0 {
            values.len().saturating_sub(value.abs() as usize)
        } else {
            (value as usize).min(values.len())
        }
    };
    let start = edge(start);
    let end = edge(end);
    return if start < end {
        values[start..end].to_vec()
    } else {
        Vec::new()
    };
}

// flight-lint: allow(f64) Principal192423ac exact-integer limb: preserve Number array-index arithmetic/undefined checks before the final usize lookup, never widen attribute values
fn collada_value<T: Copy>(values: &[T], index: f64) -> Option<T> {
    if !index.is_finite() || index < 0.0 || index.fract() != 0.0 {
        return None;
    }
    return values.get(index as usize).copied();
}

// flight-lint: allow(f64) Principal192423ac exact-integer limb: keep authored index tuples/offsets/vcounts exact through deduplication and final integer writes; all coordinates and emitted vertices stay f32
fn decode_collada_geometry(context: &Ref<ColladaParseContext>) {
    let (root, document, diagnostics, geometry_indices, geometry_positions, geometry_symbols) = {
        let context = context.read().unwrap();
        (
            context.root.clone(),
            context.document.clone(),
            context.diagnostics.clone(),
            context.geometry_id_to_mesh_index.clone(),
            context.geometry_positions.clone(),
            context.geometry_primitive_symbols.clone(),
        )
    };
    let mut sources: Vec<ColladaFloatArrayEntry> = Vec::new();
    let mut elements = Vec::new();
    collada_descendants(&mut elements, &root, "source");
    for source in elements {
        let id = collada_id_of(&source);
        let array = collada_child(Some(&source), "float_array");
        if let (Some(id), Some(array)) = (id.filter(|id| !id.is_empty()), array) {
            let value = Arc::new(RwLock::new(collada_numbers(Some(&array))));
            if let Some(entry) = sources.iter_mut().find(|entry| entry.key == id) {
                entry.value = value;
            } else {
                sources.push(ColladaFloatArrayEntry { key: id, value });
            }
        }
    }
    let mut geometries = Vec::new();
    collada_descendants(&mut geometries, &root, "geometry");
    for geometry in geometries {
        let mesh = collada_child(Some(&geometry), "mesh").or_else(|| {
            let mut nested = Vec::new();
            collada_descendants(&mut nested, &geometry, "mesh");
            nested.into_iter().next()
        });
        let Some(mesh) = mesh else {
            continue;
        };
        let children = mesh.read().unwrap().children.clone();
        let mut positions_map: Vec<(String, String)> = Vec::new();
        let mut normals_map: Vec<(String, String)> = Vec::new();
        for vertices in children
            .iter()
            .filter(|child| child.read().unwrap().name == "vertices")
        {
            let Some(id) = collada_id_of(vertices).filter(|id| !id.is_empty()) else {
                continue;
            };
            for input in &vertices.read().unwrap().children {
                let input = input.read().unwrap();
                if input.name != "input" {
                    continue;
                }
                let Some(source) = input
                    .attributes
                    .get("source")
                    .map(|source| source.strip_prefix('#').unwrap_or(source))
                    .filter(|source| !source.is_empty())
                else {
                    continue;
                };
                let target = match input.attributes.get("semantic").map(String::as_str) {
                    Some("POSITION") => &mut positions_map,
                    Some("NORMAL") => &mut normals_map,
                    _ => continue,
                };
                if let Some(entry) = target.iter_mut().find(|entry| entry.0 == id) {
                    entry.1 = source.to_string();
                } else {
                    target.push((id.clone(), source.to_string()));
                }
            }
        }
        let primitives = children
            .into_iter()
            .filter(|child| {
                matches!(
                    child.read().unwrap().name.as_str(),
                    "triangles" | "polylist" | "lines"
                )
            })
            .collect::<Vec<_>>();
        if primitives.is_empty() {
            continue;
        }
        let mut vertex_map: HashMap<Vec<u64>, usize> = HashMap::new();
        let mut vertices = Vec::<[f32; CANONICAL_FLOATS_PER_VERTEX]>::new();
        let mut indices = Vec::new();
        let mut symbols = Vec::new();
        let mut subsets = Vec::new();
        let mut has_lines = false;
        for primitive in primitives {
            let inputs = primitive
                .read()
                .unwrap()
                .children
                .iter()
                .filter(|child| child.read().unwrap().name == "input")
                .cloned()
                .collect::<Vec<_>>();
            let mut stride = 1.0f64;
            let mut semantic_sources: Vec<(String, String)> = Vec::new();
            let mut offsets: Vec<(String, f64)> = Vec::new();
            for input in inputs {
                let input = input.read().unwrap();
                let offset =
                    read_collada_offset(input.attributes.get("offset").map(String::as_str));
                let candidate = offset + 1.0;
                stride = if stride.is_nan() || candidate.is_nan() {
                    f64::NAN
                } else {
                    stride.max(candidate)
                };
                let source = input
                    .attributes
                    .get("source")
                    .map(|source| source.strip_prefix('#').unwrap_or(source))
                    .unwrap_or("");
                let semantic = input
                    .attributes
                    .get("semantic")
                    .map(String::as_str)
                    .unwrap_or("");
                let rows = if semantic == "VERTEX" {
                    vec![
                        (
                            "POSITION",
                            positions_map
                                .iter()
                                .find(|entry| entry.0 == source)
                                .map(|entry| entry.1.as_str()),
                        ),
                        (
                            "NORMAL",
                            normals_map
                                .iter()
                                .find(|entry| entry.0 == source)
                                .map(|entry| entry.1.as_str()),
                        ),
                    ]
                } else {
                    vec![(semantic, (!source.is_empty()).then_some(source))]
                };
                for (semantic, source) in rows {
                    if let Some(source) = source {
                        if let Some(entry) = semantic_sources
                            .iter_mut()
                            .find(|entry| entry.0 == semantic)
                        {
                            entry.1 = source.to_string();
                        } else {
                            semantic_sources.push((semantic.to_string(), source.to_string()));
                        }
                        if let Some(entry) = offsets.iter_mut().find(|entry| entry.0 == semantic) {
                            entry.1 = offset;
                        } else {
                            offsets.push((semantic.to_string(), offset));
                        }
                    }
                }
            }
            let find_source = |semantic: &str| {
                semantic_sources
                    .iter()
                    .find(|entry| entry.0 == semantic)
                    .and_then(|entry| sources.iter().find(|source| source.key == entry.1))
                    .map(|entry| entry.value.clone())
            };
            let Some(positions) = find_source("POSITION") else {
                report_collada_diagnostic(
                    &diagnostics,
                    ImportDiagnosticSeverity::Drop,
                    "collada.missing-reference",
                    "parseCollada",
                    Some(HashMap::from([(
                        "element".to_string(),
                        ImportDiagnosticDetailValue::String("POSITION".to_string()),
                    )])),
                );
                continue;
            };
            let normals = find_source("NORMAL");
            let uvs = find_source("TEXCOORD");
            let pos_offset = offsets
                .iter()
                .find(|entry| entry.0 == "POSITION")
                .map_or(0.0, |entry| entry.1);
            let normal_offset = offsets
                .iter()
                .find(|entry| entry.0 == "NORMAL")
                .map(|entry| entry.1);
            let uv_offset = offsets
                .iter()
                .find(|entry| entry.0 == "TEXCOORD")
                .map(|entry| entry.1);
            let raw = read_collada_indices(collada_child(Some(&primitive), "p").as_ref());
            let kind = primitive.read().unwrap().name.clone();
            let mut tuples = Vec::new();
            if kind == "polylist" {
                let counts =
                    read_collada_indices(collada_child(Some(&primitive), "vcount").as_ref());
                let mut cursor = 0.0;
                for count in counts {
                    let mut i = 1.0;
                    while i + 1.0 < count {
                        tuples.push(collada_slice(&raw, cursor, cursor + stride));
                        tuples.push(collada_slice(
                            &raw,
                            cursor + i * stride,
                            cursor + i * stride + stride,
                        ));
                        tuples.push(collada_slice(
                            &raw,
                            cursor + (i + 1.0) * stride,
                            cursor + (i + 1.0) * stride + stride,
                        ));
                        i += 1.0;
                    }
                    cursor += count * stride;
                }
            } else {
                let mut i = 0.0;
                while i + stride - 1.0 < (raw.len() as f64) {
                    tuples.push(collada_slice(&raw, i, i + stride));
                    i += stride;
                }
            }
            let first_index = indices.len();
            let positions = positions.read().unwrap();
            let normals = normals.as_ref().map(|values| values.read().unwrap());
            let uvs = uvs.as_ref().map(|values| values.read().unwrap());
            for tuple in tuples {
                // Finite Number string keys distinguish each value except -0 and 0.
                // Lookup-only hashing preserves the source's first-use vertex order.
                let key = tuple
                    .iter()
                    .map(|value| if *value == 0.0 { 0 } else { value.to_bits() })
                    .collect::<Vec<_>>();
                let index = if let Some(index) = vertex_map.get(&key) {
                    *index
                } else {
                    let index = vertices.len();
                    let pi = collada_value(&tuple, pos_offset).unwrap_or(f64::NAN);
                    let mut vertex = [0.0; CANONICAL_FLOATS_PER_VERTEX];
                    for component in 0..3 {
                        vertex[component] =
                            collada_value(&positions, pi * 3.0 + component as f64).unwrap_or(0.0);
                    }
                    vertex[4] = 1.0;
                    vertex[9] = 1.0;
                    if let (Some(normals), Some(offset)) = (&normals, normal_offset) {
                        let ni = collada_value(&tuple, offset).unwrap_or(f64::NAN);
                        for component in 0..3 {
                            vertex[3 + component] =
                                collada_value(normals, ni * 3.0 + component as f64)
                                    .unwrap_or(if component == 1 { 1.0 } else { 0.0 });
                        }
                    }
                    if let (Some(uvs), Some(offset)) = (&uvs, uv_offset) {
                        let ui = collada_value(&tuple, offset).unwrap_or(f64::NAN);
                        for component in 0..2 {
                            vertex[10 + component] =
                                collada_value(uvs, ui * 2.0 + component as f64).unwrap_or(0.0);
                        }
                    }
                    vertex_map.insert(key, index);
                    vertices.push(vertex);
                    index
                };
                indices.push(index as u32);
            }
            let count = indices.len() - first_index;
            if count > 0 {
                subsets.push(MeshSubset {
                    index_count: count as u32,
                    index_offset: first_index as u32,
                });
            }
            has_lines |= kind == "lines";
            if let Some(symbol) = primitive
                .read()
                .unwrap()
                .attributes
                .get("material")
                .filter(|symbol| !symbol.is_empty())
            {
                symbols.push(symbol.clone());
            }
        }
        if vertices.is_empty() {
            continue;
        }
        let geometry_ref = Arc::new(RwLock::new(create_mesh_geometry(MeshGeometryOptions {
            vertices: vertices
                .into_iter()
                .flatten()
                .collect::<Vec<_>>()
                .into_boxed_slice(),
            indices: Some(IndexBuffer::U32(IndexBufferU32 {
                data: Arc::new(RwLock::new(indices.into_boxed_slice())),
            })),
            layout: CANONICAL_LAYOUT.clone(),
            subsets: Some(subsets),
            topology: Some(if has_lines {
                PrimitiveTopology::LineList
            } else {
                PrimitiveTopology::TriangleList
            }),
        })));
        let position_source = positions_map
            .first()
            .and_then(|entry| sources.iter().find(|source| source.key == entry.1))
            .map(|entry| entry.value.clone());
        let id = collada_id_of(&geometry).filter(|id| !id.is_empty());
        let name = geometry.read().unwrap().attributes.get("name").cloned();
        let mut document = document.write().unwrap();
        if let Some(id) = id {
            set_collada_index(
                &mut geometry_indices.write().unwrap(),
                &id,
                document.meshes.len() as i32,
            );
            if let Some(value) = position_source {
                let mut positions = geometry_positions.write().unwrap();
                if let Some(entry) = positions.iter_mut().find(|entry| entry.key == id) {
                    entry.value = value;
                } else {
                    positions.push(ColladaFloatArrayEntry {
                        key: id.clone(),
                        value,
                    });
                }
            }
            if !symbols.is_empty() {
                let value = Arc::new(RwLock::new(symbols));
                let mut entries = geometry_symbols.write().unwrap();
                if let Some(entry) = entries.iter_mut().find(|entry| entry.key == id) {
                    entry.value = value;
                } else {
                    entries.push(ColladaStringArrayEntry { key: id, value });
                }
            }
        }
        document.meshes.push(Scene3DDocumentMesh {
            geometry: geometry_ref,
            materials: Vec::new(),
            name,
            skin: None,
            morph: None,
        });
    }
}

// flight-lint: allow(f64) Principal192423ac exact-integer limb: reuse strict Number parsing for index tuple identity/counts before any f32 projection; no coordinate widening
fn read_collada_indices(element: Option<&Ref<XmlElement>>) -> Vec<f64> {
    let Some(element) = element else {
        return Vec::new();
    };
    let element = element.read().unwrap();
    return element
        .text
        .trim_matches(is_obj_whitespace)
        .split(is_obj_whitespace)
        .filter(|value| !value.is_empty())
        .map(parse_stl_number)
        .filter(|value| value.is_finite())
        .collect();
}

// flight-lint: allow(f64) Principal192423ac exact-integer limb: retain strict Number offsets through source stride arithmetic, narrowing only the final integer array lookup
fn read_collada_offset(text: Option<&str>) -> f64 {
    return parse_stl_number(text.unwrap_or("0"));
}
