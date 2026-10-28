use crate::obj_features::is_obj_whitespace;
use crate::obj_number::{parse_obj_float, parse_obj_integer};
use crate::obj_schema::ObjMaterialLibrary;
use crate::obj_types::ObjMaterialHandler;
use crate::shared::{CANONICAL_FLOATS_PER_VERTEX, CANONICAL_LAYOUT};
use flight_entity::Ref;
use flight_geometry::contract::create_transform3d;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_meshgeometry::{
    IndexBuffer, IndexBufferU32, MeshGeometry, MeshGeometryOptions, MeshSubset, PrimitiveTopology,
    clone_mesh_geometry, compute_mesh_geometry_normals, compute_mesh_geometry_tangents,
    create_mesh_geometry,
};
use flight_scene3d::{
    MESH_KIND, Scene3DDocument, Scene3DDocumentMaterial, Scene3DDocumentMesh, Scene3DDocumentNode,
    Scene3DDocumentScene,
};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

// flight-lint: allow(f64) Foreman80958601 private OBJ parseFloat/finite adapter retains source Number channels until final Float32 vertex writes; only the approved UV 1-v complement computes before narrowing
struct ObjAttributes {
    positions: Vec<f64>,
    normals: Vec<f64>,
    uvs: Vec<f64>,
}

struct ObjDropTally {
    key: String,
    count: usize,
    detail: HashMap<String, ImportDiagnosticDetailValue>,
    kind: String,
    severity: ImportDiagnosticSeverity,
}

struct ObjGroup {
    name: Option<String>,
    buckets: Vec<ObjMaterialBucket>,
    line_elements: Vec<Vec<usize>>,
    point_elements: Vec<usize>,
}

// flight-lint: allow(f64) Foreman80958601 private prefix-validated source Number channels are copied without arithmetic through material buckets until final canonical Float32Array geometry writes
struct ObjMaterialBucket {
    name: String,
    dedup: HashMap<String, u32>,
    indices: Vec<u32>,
    vertices: Vec<f64>,
}

struct ObjMaterialIndex {
    name: String,
    index: i32,
}

fn create_obj_geometry(
    vertices: Vec<f32>,
    indices: Vec<u32>,
    subsets: Vec<MeshSubset>,
    topology: Option<PrimitiveTopology>,
) -> MeshGeometry {
    return create_mesh_geometry(MeshGeometryOptions {
        vertices: vertices.into_boxed_slice(),
        layout: CANONICAL_LAYOUT.clone(),
        indices: Some(IndexBuffer::U32(IndexBufferU32 {
            data: Arc::new(RwLock::new(indices.into_boxed_slice())),
        })),
        subsets: Some(subsets),
        topology,
    });
}

fn append_obj_mesh(
    document: &mut Scene3DDocument,
    geometry: MeshGeometry,
    materials: Vec<i32>,
    name: Option<&str>,
) {
    let mesh_index = document.meshes.len() as i32;
    document.meshes.push(Scene3DDocumentMesh {
        geometry: Arc::new(RwLock::new(geometry)),
        materials,
        morph: None,
        name: None,
        skin: None,
    });
    let node_index = document.nodes.len() as i32;
    document.nodes.push(Scene3DDocumentNode {
        children: Vec::new(),
        kind: MESH_KIND.to_string(),
        mesh: Some(mesh_index),
        name: name.map(str::to_string),
        transform: create_transform3d(),
    });
    document.scenes[0].root_nodes.push(node_index);
}

// flight-lint: allow(f64) Foreman80958601 private prefix-validated positions are narrowed only at canonical Float32 vertex writes; no topology arithmetic widens
fn append_obj_topology_mesh(
    document: &mut Scene3DDocument,
    elements: &[usize],
    source_positions: &[f64],
    topology: PrimitiveTopology,
    name: Option<&str>,
) {
    if elements.is_empty() {
        return;
    }
    let mut vertices = Vec::new();
    let mut indices = Vec::new();
    let mut dedup = HashMap::new();
    for source in elements {
        let emitted = if let Some(emitted) = dedup.get(source) {
            *emitted
        } else {
            let emitted = (vertices.len() / CANONICAL_FLOATS_PER_VERTEX) as u32;
            vertices.extend_from_slice(&[
                source_positions[source * 3] as f32,
                source_positions[source * 3 + 1] as f32,
                source_positions[source * 3 + 2] as f32,
            ]);
            vertices.resize(vertices.len() + CANONICAL_FLOATS_PER_VERTEX - 3, 0.0);
            dedup.insert(*source, emitted);
            emitted
        };
        indices.push(emitted);
    }
    let count = indices.len() as u32;
    let geometry = create_obj_geometry(
        vertices,
        indices,
        vec![MeshSubset {
            index_offset: 0,
            index_count: count,
        }],
        Some(topology),
    );
    append_obj_mesh(document, geometry, vec![-1], name);
}

fn detail_obj_line(line: usize) -> HashMap<String, ImportDiagnosticDetailValue> {
    return HashMap::from([(
        "firstLine".to_string(),
        ImportDiagnosticDetailValue::Number((line + 1) as f32),
    )]);
}

fn flush_obj_group(
    document: &mut Scene3DDocument,
    group: &ObjGroup,
    attributes: &ObjAttributes,
    library: Option<&ObjMaterialLibrary>,
    material_handlers: &[Ref<ObjMaterialHandler>],
    cache: &mut Vec<ObjMaterialIndex>,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) {
    let mut vertices = Vec::new();
    let mut indices = Vec::new();
    let mut subsets = Vec::new();
    let mut materials = Vec::new();
    for bucket in &group.buckets {
        if bucket.indices.is_empty() {
            continue;
        }
        let vertex_base = (vertices.len() / CANONICAL_FLOATS_PER_VERTEX) as u32;
        let index_offset = indices.len() as u32;
        indices.extend(bucket.indices.iter().map(|index| *index + vertex_base));
        vertices.extend(bucket.vertices.iter().map(|value| *value as f32));
        subsets.push(MeshSubset {
            index_count: bucket.indices.len() as u32,
            index_offset,
        });
        materials.push(resolve_obj_material(
            document,
            &bucket.name,
            library,
            material_handlers,
            cache,
            diagnostics.as_deref_mut(),
        ));
    }
    let mut line_segments = Vec::new();
    for chain in &group.line_elements {
        for edge in chain.windows(2) {
            line_segments.extend_from_slice(edge);
        }
    }
    append_obj_topology_mesh(
        document,
        &line_segments,
        &attributes.positions,
        PrimitiveTopology::LineList,
        group.name.as_deref(),
    );
    append_obj_topology_mesh(
        document,
        &group.point_elements,
        &attributes.positions,
        PrimitiveTopology::PointList,
        group.name.as_deref(),
    );
    if subsets.is_empty() {
        return;
    }
    let mut geometry = create_obj_geometry(vertices, indices, subsets, None);
    if attributes.normals.is_empty() {
        let source = clone_mesh_geometry(&geometry);
        compute_mesh_geometry_normals(&mut geometry, &source, None);
    }
    if !attributes.uvs.is_empty() {
        let source = clone_mesh_geometry(&geometry);
        compute_mesh_geometry_tangents(&mut geometry, &source, None);
    }
    append_obj_mesh(document, geometry, materials, group.name.as_deref());
}

fn get_or_create_obj_bucket(buckets: &mut Vec<ObjMaterialBucket>, name: &str) -> usize {
    if let Some(index) = buckets.iter().position(|bucket| bucket.name == name) {
        return index;
    }
    buckets.push(ObjMaterialBucket {
        name: name.to_string(),
        dedup: HashMap::new(),
        indices: Vec::new(),
        vertices: Vec::new(),
    });
    return buckets.len() - 1;
}

// flight-lint: allow(f64) Foreman80958601 private OBJ decimal-prefix parseFloat/Number.isFinite precedes final Float32 writes; UV 1-v is computed in source Number precision before narrowing
fn parse_obj_components(
    args: &str,
    count: usize,
    kind: &str,
    drops: Option<&mut Vec<ObjDropTally>>,
    line: usize,
) -> Option<Vec<f64>> {
    let parts: Vec<_> = args
        .split(is_obj_whitespace)
        .filter(|part| !part.is_empty())
        .collect();
    let reason = if parts.len() < count {
        Some("too-few-components")
    } else if parts[..count]
        .iter()
        .any(|part| parse_obj_float(part).is_none())
    {
        Some("non-numeric")
    } else {
        None
    };
    if let Some(reason) = reason {
        let mut detail = detail_obj_line(line);
        detail.insert(
            "reason".to_string(),
            ImportDiagnosticDetailValue::String(reason.to_string()),
        );
        tally_obj_drop(drops, ImportDiagnosticSeverity::Drop, kind, reason, detail);
        return None;
    }
    let mut values: Vec<_> = parts[..count]
        .iter()
        .map(|part| parse_obj_float(part).unwrap())
        .collect();
    if count == 2 {
        values[1] = 1.0 - values[1];
    }
    return Some(values);
}

// flight-lint: allow(f64) Foreman80958601 private OBJ parseInt prefix/finite and signed-relative bounds checks occur before valid indices narrow to native offsets; source channels remain Number until canonical Float32 geometry emission
fn parse_obj_face_vertex(
    token: &str,
    attributes: &ObjAttributes,
    bucket: &mut ObjMaterialBucket,
    smoothing: &str,
    mut drops: Option<&mut Vec<ObjDropTally>>,
    line: usize,
) -> Option<u32> {
    let parts: Vec<_> = token.split('/').collect();
    let raw = parse_obj_integer(parts[0]).filter(|value| *value != 0.0);
    let Some(raw) = raw else {
        let mut detail = detail_obj_line(line);
        detail.insert(
            "firstToken".to_string(),
            ImportDiagnosticDetailValue::String(token.to_string()),
        );
        tally_obj_drop(
            drops,
            ImportDiagnosticSeverity::Drop,
            "obj.face-vertex-invalid",
            "",
            detail,
        );
        return None;
    };
    let count = attributes.positions.len() / 3;
    let position = if raw > 0.0 {
        raw - 1.0
    } else {
        count as f64 + raw
    };
    if position < 0.0 || position >= count as f64 {
        let mut detail = detail_obj_line(line);
        detail.insert(
            "firstIndex".to_string(),
            ImportDiagnosticDetailValue::Number(raw as f32),
        );
        tally_obj_drop(
            drops,
            ImportDiagnosticSeverity::Drop,
            "obj.position-index-out-of-range",
            "",
            detail,
        );
        return None;
    }
    let position = position as usize;
    let mut uv = None;
    let mut normal = None;
    for (part, count, slot, kind) in [
        (1, attributes.uvs.len() / 2, &mut uv, "obj.uv-index-invalid"),
        (
            2,
            attributes.normals.len() / 3,
            &mut normal,
            "obj.normal-index-invalid",
        ),
    ] {
        if let Some(token) = parts.get(part).filter(|token| !token.is_empty()) {
            *slot = resolve_obj_attribute_index(token, count);
            if slot.is_none() {
                let mut detail = detail_obj_line(line);
                detail.insert(
                    "firstToken".to_string(),
                    ImportDiagnosticDetailValue::String(token.to_string()),
                );
                tally_obj_drop(
                    drops.as_deref_mut(),
                    ImportDiagnosticSeverity::Recover,
                    kind,
                    "",
                    detail,
                );
            }
        }
    }
    let suffix = normal
        .map(|index| format!("n{index}"))
        .unwrap_or_else(|| smoothing.to_string());
    let key = format!(
        "{position}/{}/{suffix}",
        uv.map(|index| index.to_string())
            .unwrap_or_else(|| "-1".to_string())
    );
    if let Some(index) = bucket.dedup.get(&key) {
        return Some(*index);
    }
    let index = (bucket.vertices.len() / CANONICAL_FLOATS_PER_VERTEX) as u32;
    bucket
        .vertices
        .extend_from_slice(&attributes.positions[position * 3..position * 3 + 3]);
    if let Some(normal) = normal {
        bucket
            .vertices
            .extend_from_slice(&attributes.normals[normal * 3..normal * 3 + 3]);
    } else {
        bucket.vertices.extend_from_slice(&[0.0; 3]);
    }
    bucket.vertices.extend_from_slice(&[0.0; 4]);
    if let Some(uv) = uv {
        bucket
            .vertices
            .extend_from_slice(&attributes.uvs[uv * 2..uv * 2 + 2]);
    } else {
        bucket.vertices.extend_from_slice(&[0.0; 2]);
    }
    bucket.dedup.insert(key, index);
    return Some(index);
}

pub fn parse_obj_with_material_handlers(
    source: &str,
    materials: Option<&ObjMaterialLibrary>,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    material_handlers: &[Ref<ObjMaterialHandler>],
) -> Scene3DDocument {
    let mut attributes = ObjAttributes {
        positions: Vec::new(),
        normals: Vec::new(),
        uvs: Vec::new(),
    };
    let mut document = Scene3DDocument {
        animations: Vec::new(),
        cameras: Vec::new(),
        lights: Vec::new(),
        materials: Vec::new(),
        meshes: Vec::new(),
        metadata: None,
        nodes: Vec::new(),
        resources: Vec::new(),
        scenes: vec![Scene3DDocumentScene {
            name: None,
            root_nodes: Vec::new(),
        }],
        skins: Vec::new(),
    };
    let mut group = ObjGroup {
        name: None,
        buckets: Vec::new(),
        line_elements: Vec::new(),
        point_elements: Vec::new(),
    };
    let mut active_material = String::new();
    let mut smoothing_group = Some(u64::MAX);
    let mut face_ordinal: usize = 0;
    let mut cache = Vec::new();
    let mut drops = diagnostics.is_some().then(Vec::new);
    for (line, raw) in source.split('\n').enumerate() {
        let raw = raw.trim_matches(is_obj_whitespace);
        if raw.is_empty() || raw.starts_with('#') {
            continue;
        }
        let Some(space) = raw.find(' ') else {
            match raw {
                "v" | "vn" | "vt" => {
                    let kind = match raw {
                        "v" => "obj.vertex-malformed",
                        "vn" => "obj.normal-malformed",
                        _ => "obj.uv-malformed",
                    };
                    parse_obj_components(
                        "",
                        if raw == "vt" { 2 } else { 3 },
                        kind,
                        drops.as_mut(),
                        line,
                    );
                }
                "f" => tally_obj_drop(
                    drops.as_mut(),
                    ImportDiagnosticSeverity::Drop,
                    "obj.face-too-few-vertices",
                    "",
                    detail_obj_line(line),
                ),
                "g" | "o" => {
                    if raw == "o" {
                        tally_obj_drop(
                            drops.as_mut(),
                            ImportDiagnosticSeverity::Recover,
                            "obj.object-name-missing",
                            "",
                            detail_obj_line(line),
                        );
                    }
                    flush_obj_group(
                        &mut document,
                        &group,
                        &attributes,
                        materials,
                        material_handlers,
                        &mut cache,
                        diagnostics.as_deref_mut(),
                    );
                    group = ObjGroup {
                        name: None,
                        buckets: Vec::new(),
                        line_elements: Vec::new(),
                        point_elements: Vec::new(),
                    };
                }
                "usemtl" => active_material.clear(),
                _ => {}
            }
            continue;
        };
        let directive = &raw[..space];
        let args = raw[space + 1..].trim_matches(is_obj_whitespace);
        match directive {
            "v" | "vn" | "vt" => {
                let kind = match directive {
                    "v" => "obj.vertex-malformed",
                    "vn" => "obj.normal-malformed",
                    _ => "obj.uv-malformed",
                };
                if let Some(values) = parse_obj_components(
                    args,
                    if directive == "vt" { 2 } else { 3 },
                    kind,
                    drops.as_mut(),
                    line,
                ) {
                    match directive {
                        "v" => attributes.positions.extend(values),
                        "vn" => attributes.normals.extend(values),
                        _ => attributes.uvs.extend(values),
                    }
                }
            }
            "f" => {
                let tokens: Vec<_> = args
                    .split(is_obj_whitespace)
                    .filter(|token| !token.is_empty())
                    .collect();
                if tokens.len() < 3 {
                    tally_obj_drop(
                        drops.as_mut(),
                        ImportDiagnosticSeverity::Drop,
                        "obj.face-too-few-vertices",
                        "",
                        detail_obj_line(line),
                    );
                    continue;
                }
                let bucket = get_or_create_obj_bucket(&mut group.buckets, &active_material);
                let smoothing = match smoothing_group {
                    None => format!("s-{}", face_ordinal + 1),
                    Some(u64::MAX) => "s-1".to_string(),
                    Some(bits) => format!("s{bits:x}"),
                };
                let mut indices = Vec::new();
                for token in tokens {
                    let Some(index) = parse_obj_face_vertex(
                        token,
                        &attributes,
                        &mut group.buckets[bucket],
                        &smoothing,
                        drops.as_mut(),
                        line,
                    ) else {
                        break;
                    };
                    indices.push(index);
                }
                for triangle in 1..indices.len().saturating_sub(1) {
                    group.buckets[bucket].indices.extend_from_slice(&[
                        indices[0],
                        indices[triangle],
                        indices[triangle + 1],
                    ]);
                }
                face_ordinal += 1;
            }
            "g" | "o" => {
                flush_obj_group(
                    &mut document,
                    &group,
                    &attributes,
                    materials,
                    material_handlers,
                    &mut cache,
                    diagnostics.as_deref_mut(),
                );
                group = ObjGroup {
                    name: (!args.is_empty()).then(|| args.to_string()),
                    buckets: Vec::new(),
                    line_elements: Vec::new(),
                    point_elements: Vec::new(),
                };
            }
            "usemtl" => active_material = args.to_string(),
            "s" => smoothing_group = resolve_obj_smoothing_group(args),
            "l" => {
                let resolved = resolve_obj_element_indices(
                    args,
                    attributes.positions.len() / 3,
                    drops.as_mut(),
                    line,
                );
                if resolved.len() >= 2 {
                    group.line_elements.push(resolved);
                }
            }
            "p" => group.point_elements.extend(resolve_obj_element_indices(
                args,
                attributes.positions.len() / 3,
                drops.as_mut(),
                line,
            )),
            _ => {}
        }
    }
    flush_obj_group(
        &mut document,
        &group,
        &attributes,
        materials,
        material_handlers,
        &mut cache,
        diagnostics.as_deref_mut(),
    );
    if let Some(drops) = drops {
        for mut tally in drops {
            tally.detail.insert(
                "count".to_string(),
                ImportDiagnosticDetailValue::Number(tally.count as f32),
            );
            report_import_diagnostic(
                diagnostics.as_deref_mut(),
                tally.severity,
                &tally.kind,
                "parseObj",
                Some(tally.detail),
            );
        }
    }
    return document;
}

// flight-lint: allow(f64) Foreman80958601 private OBJ decimal-prefix parseInt/finite and relative bounds checks precede native offset projection, with no public index widening
fn resolve_obj_attribute_index(token: &str, count: usize) -> Option<usize> {
    let raw = parse_obj_integer(token)?;
    if raw == 0.0 {
        return None;
    }
    let index = if raw > 0.0 {
        raw - 1.0
    } else {
        count as f64 + raw
    };
    return (index >= 0.0 && index < count as f64).then_some(index as usize);
}

fn resolve_obj_element_indices(
    args: &str,
    count: usize,
    mut drops: Option<&mut Vec<ObjDropTally>>,
    line: usize,
) -> Vec<usize> {
    let mut resolved = Vec::new();
    for token in args
        .split(is_obj_whitespace)
        .filter(|token| !token.is_empty())
    {
        if let Some(index) = resolve_obj_attribute_index(token.split('/').next().unwrap(), count) {
            resolved.push(index);
        } else {
            let mut detail = detail_obj_line(line);
            detail.insert(
                "firstToken".to_string(),
                ImportDiagnosticDetailValue::String(token.to_string()),
            );
            tally_obj_drop(
                drops.as_deref_mut(),
                ImportDiagnosticSeverity::Drop,
                "obj.element-index-out-of-range",
                "",
                detail,
            );
        }
    }
    return resolved;
}

fn resolve_obj_material(
    document: &mut Scene3DDocument,
    name: &str,
    library: Option<&ObjMaterialLibrary>,
    material_handlers: &[Ref<ObjMaterialHandler>],
    cache: &mut Vec<ObjMaterialIndex>,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> i32 {
    if name.is_empty() {
        return -1;
    }
    if let Some(entry) = cache.iter().find(|entry| entry.name == name) {
        return entry.index;
    }
    let parsed =
        library.and_then(|library| library.materials.iter().find(|entry| entry.key == name));
    let Some(parsed) = parsed else {
        if library.is_some() {
            report_import_diagnostic(
                diagnostics,
                ImportDiagnosticSeverity::Drop,
                "obj.material-missing",
                "resolveObjMaterial",
                Some(HashMap::from([(
                    "name".to_string(),
                    ImportDiagnosticDetailValue::String(name.to_string()),
                )])),
            );
        }
        cache.push(ObjMaterialIndex {
            name: name.to_string(),
            index: -1,
        });
        return -1;
    };
    for handler in material_handlers {
        let matches = handler.read().unwrap().matches.clone();
        if !matches(&parsed.value) {
            continue;
        }
        let resolve = handler.read().unwrap().resolve.clone();
        let mut material = resolve(&parsed.value, document, diagnostics.as_deref_mut());
        match &mut material {
            Scene3DDocumentMaterial::Entity(value) => {
                value.material.write().unwrap().material_fields_mut().name = Some(name.to_string())
            }
            Scene3DDocumentMaterial::Fields(value) => value.name = Some(name.to_string()),
        }
        let index = document.materials.len() as i32;
        document.materials.push(material);
        cache.push(ObjMaterialIndex {
            name: name.to_string(),
            index,
        });
        return index;
    }
    cache.push(ObjMaterialIndex {
        name: name.to_string(),
        index: -1,
    });
    return -1;
}

// flight-lint: allow(f64) Foreman80958601 private OBJ parseInt prefix/finite positive smoothing IDs retain exact source Number identity; bits are an internal injective key, not a serialized public number or a new numeric policy
fn resolve_obj_smoothing_group(args: &str) -> Option<u64> {
    return parse_obj_integer(args)
        .filter(|value| *value > 0.0)
        .map(|value| value.to_bits());
}

fn tally_obj_drop(
    drops: Option<&mut Vec<ObjDropTally>>,
    severity: ImportDiagnosticSeverity,
    kind: &str,
    discriminator: &str,
    detail: HashMap<String, ImportDiagnosticDetailValue>,
) {
    let Some(drops) = drops else {
        return;
    };
    let key = format!("{kind}|{discriminator}");
    if let Some(entry) = drops.iter_mut().find(|entry| entry.key == key) {
        entry.count += 1;
    } else {
        drops.push(ObjDropTally {
            key,
            count: 1,
            detail,
            kind: kind.to_string(),
            severity,
        });
    }
}
