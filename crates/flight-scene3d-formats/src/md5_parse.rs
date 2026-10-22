use crate::md5_number::{is_md5_whitespace, parse_md5_float, parse_md5_integer};
use crate::md5_types::{
    MD5_MATERIAL_FEATURE, MD5_SKELETON_FEATURE, Md5DropTally, Md5DropTallyEntry, Md5Joint, Md5Mesh,
    Md5MeshSection, Md5ParseContext, Md5SectionHandler, Md5Vertex, Md5Weight,
};
use crate::shared::{
    MAX_SKIN_INFLUENCES, SKINNED_FLOATS_PER_VERTEX, SkinInfluence, convert_positions_z_up_to_y_up,
    pack_skin_influences, reverse_triangle_winding,
};
use flight_entity::Ref;
use flight_geometry::create_transform3d;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_meshgeometry::{
    CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, IndexBuffer, IndexBufferU32, MeshGeometry,
    MeshGeometryOptions, MeshTriangleVertexIndices, VertexSemantic, clone_mesh_geometry,
    compute_mesh_geometry_normals, compute_mesh_geometry_position_groups,
    compute_mesh_geometry_tangents, create_mesh_geometry, get_mesh_geometry_triangle_count,
    get_mesh_geometry_triangle_vertex_indices, get_vertex_attribute_float_offset,
};
use flight_scene3d::{
    MESH_KIND, Scene3DDocument, Scene3DDocumentMesh, Scene3DDocumentNode, Scene3DDocumentScene,
};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

struct Md5WeightInfluence {
    joint_index: f32,
    mx: f32,
    my: f32,
    mz: f32,
    weight: f32,
}

fn align_md5_records<T>(
    records: &mut Vec<T>,
    index: usize,
    drops: Option<&mut Vec<Md5DropTallyEntry>>,
    record: &str,
    placeholder: impl Fn() -> T,
) {
    if index == records.len() {
        return;
    }
    let kind = if index < records.len() {
        "repeated"
    } else {
        "gap"
    };
    tally_md5_drop(
        drops,
        ImportDiagnosticSeverity::Recover,
        &format!("md5mesh.{record}-index-{kind}"),
        record,
        md5_number_detail(&[
            ("firstExpected", records.len() as f32),
            ("firstIndex", index as f32),
        ]),
    );
    while records.len() < index {
        records.push(placeholder());
    }
}

pub fn canonicalize_md5_tangent_handedness(
    geometry: &mut MeshGeometry,
    mut md5_drops: Option<&mut Vec<Md5DropTallyEntry>>,
) {
    let layout = geometry.layout.read().unwrap();
    let floats_per_vertex = layout.stride as usize / 4;
    let tangent_offset = get_vertex_attribute_float_offset(&layout, VertexSemantic::Tangent);
    let uv_offset = get_vertex_attribute_float_offset(&layout, VertexSemantic::Uv0);
    drop(layout);
    if floats_per_vertex == 0 || tangent_offset < 0 || uv_offset < 0 {
        return;
    }
    let vertex_count = geometry.vertices.len() / floats_per_vertex;
    let mut corner = MeshTriangleVertexIndices {
        i0: 0,
        i1: 0,
        i2: 0,
    };
    let mut resolved = vec![0i8; vertex_count];
    let mut contradictions = 0;
    for triangle in 0..get_mesh_geometry_triangle_count(geometry) {
        if !get_mesh_geometry_triangle_vertex_indices(&mut corner, geometry, triangle) {
            continue;
        }
        let u0 = corner.i0 as usize * floats_per_vertex + uv_offset as usize;
        let u1 = corner.i1 as usize * floats_per_vertex + uv_offset as usize;
        let u2 = corner.i2 as usize * floats_per_vertex + uv_offset as usize;
        let vertices = &geometry.vertices;
        let read = |index: usize| vertices.get(index).copied().unwrap_or(f32::NAN);
        let determinant = (read(u1) - read(u0)) * (read(u2 + 1) - read(u0 + 1))
            - (read(u2) - read(u0)) * (read(u1 + 1) - read(u0 + 1));
        if determinant == 0.0 {
            continue;
        }
        let sign = if determinant < 0.0 { -1 } else { 1 };
        for vertex in [corner.i0, corner.i1, corner.i2] {
            if let Some(value) = resolved.get_mut(vertex as usize) {
                if *value == 0 {
                    *value = sign;
                } else if *value != sign {
                    contradictions += 1;
                }
            }
        }
    }
    if contradictions > 0 {
        tally_md5_drop(
            md5_drops.as_deref_mut(),
            ImportDiagnosticSeverity::Recover,
            "md5mesh.tangent-handedness-contradiction",
            "",
            md5_number_detail(&[("firstVertices", contradictions as f32)]),
        );
    }
    for (vertex, sign) in resolved.iter().enumerate() {
        if *sign != 0 {
            if let Some(value) = geometry
                .vertices
                .get_mut(vertex * floats_per_vertex + tangent_offset as usize + 3)
            {
                *value = *sign as f32;
            }
        }
    }
}

fn empty_md5_document() -> Scene3DDocument {
    return Scene3DDocument {
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
}

fn md5_malformed(
    drops: Option<&mut Vec<Md5DropTallyEntry>>,
    record: &str,
    reason: &str,
    line_index: usize,
) {
    let mut detail = md5_number_detail(&[("firstLine", (line_index + 1) as f32)]);
    detail.insert(
        "reason".to_string(),
        ImportDiagnosticDetailValue::String(reason.to_string()),
    );
    tally_md5_drop(
        drops,
        ImportDiagnosticSeverity::Drop,
        &format!("md5mesh.malformed-{record}"),
        reason,
        detail,
    );
}

fn md5_number_detail(values: &[(&str, f32)]) -> HashMap<String, ImportDiagnosticDetailValue> {
    return values
        .iter()
        .map(|(key, value)| (key.to_string(), ImportDiagnosticDetailValue::Number(*value)))
        .collect();
}

// flight-lint: allow(f64) Principal7f1f0994 private mesh joint token-finite, sumSq normalization and W adapter preserves JS Number branch before canonical f32 record write; animation uses a separate rule
fn parse_joint_line(
    line: &str,
    mut drops: Option<&mut Vec<Md5DropTallyEntry>>,
    line_index: usize,
) -> Option<Md5Joint> {
    let Some((name, rest)) = quoted_md5_name(line) else {
        md5_malformed(drops, "joint", "missing-name-quotes", line_index);
        return None;
    };
    let tokens = split_md5_components(rest);
    if tokens.len() < 7 {
        md5_malformed(drops, "joint", "not-enough-components", line_index);
        return None;
    }
    let values = [
        parse_md5_integer(&tokens[0]),
        parse_md5_float(&tokens[1]),
        parse_md5_float(&tokens[2]),
        parse_md5_float(&tokens[3]),
        parse_md5_float(&tokens[4]),
        parse_md5_float(&tokens[5]),
        parse_md5_float(&tokens[6]),
    ];
    if values.iter().any(Option::is_none) {
        md5_malformed(drops, "joint", "non-numeric", line_index);
        return None;
    }
    let values = values.map(Option::unwrap);
    let (mut x, mut y, mut z) = (values[4], values[5], values[6]);
    let mut sum_sq = x * x + y * y + z * z;
    if sum_sq > 1.0 + 1e-4 {
        tally_md5_drop(
            drops.as_deref_mut(),
            ImportDiagnosticSeverity::Recover,
            "md5mesh.joint-orientation-not-unit",
            "",
            md5_number_detail(&[("firstLine", (line_index + 1) as f32)]),
        );
        let scale = 1.0 / sum_sq.sqrt();
        x *= scale;
        y *= scale;
        z *= scale;
        sum_sq = 1.0;
    }
    let w = if sum_sq < 1.0 {
        -(1.0 - sum_sq).sqrt()
    } else {
        0.0
    };
    return Some(Md5Joint {
        name: name.to_string(),
        parent_index: values[0] as i32,
        position_x: values[1] as f32,
        position_y: values[2] as f32,
        position_z: values[3] as f32,
        orientation_x: x as f32,
        orientation_y: y as f32,
        orientation_z: z as f32,
        orientation_w: w as f32,
    });
}

fn parse_joints_block(
    lines: &[&str],
    start_line: usize,
    joints: &mut Vec<Md5Joint>,
    mut drops: Option<&mut Vec<Md5DropTallyEntry>>,
) -> usize {
    let mut index = start_line;
    while index < lines.len() {
        let line = lines[index].trim_matches(is_md5_whitespace);
        index += 1;
        if line == "}" {
            return index;
        }
        if line.is_empty() || line.starts_with("//") {
            continue;
        }
        if let Some(joint) = parse_joint_line(line, drops.as_deref_mut(), index - 1) {
            joints.push(joint);
        }
    }
    tally_md5_drop(
        drops,
        ImportDiagnosticSeverity::Recover,
        "md5mesh.joints-block-unclosed",
        "",
        HashMap::new(),
    );
    return index;
}

fn parse_md5_declared_count(line: &str) -> Option<usize> {
    let value = parse_md5_integer(
        line.split(is_md5_whitespace)
            .filter(|s| !s.is_empty())
            .nth(1)?,
    )?;
    return (value >= 0.0).then_some(value as usize);
}

pub fn parse_md5_mesh_with_section_handlers(
    source: &str,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    section_handlers: &[Ref<Md5SectionHandler>],
) -> Scene3DDocument {
    let mut document = empty_md5_document();
    let mut drops = diagnostics.as_ref().map(|_| Vec::new());
    let mut joints = Vec::new();
    let mut meshes = Vec::new();
    let lines: Vec<_> = source.split('\n').collect();
    let mut index = 0;
    while index < lines.len() {
        let line = lines[index].trim_matches(is_md5_whitespace);
        index += 1;
        if line.is_empty() || line.starts_with("//") {
            continue;
        }
        if line.starts_with("MD5Version") {
            if let Some(version) = line
                .split(is_md5_whitespace)
                .filter(|s| !s.is_empty())
                .nth(1)
                .and_then(parse_md5_integer)
            {
                if version != 10.0 {
                    tally_md5_drop(
                        drops.as_mut(),
                        ImportDiagnosticSeverity::Recover,
                        "md5mesh.unsupported-version",
                        "",
                        md5_number_detail(&[("version", version as f32)]),
                    );
                }
            }
            continue;
        }
        if line.starts_with("commandline")
            || line.starts_with("numJoints")
            || line.starts_with("numMeshes")
        {
            continue;
        }
        if line == "joints {" {
            index = parse_joints_block(&lines, index, &mut joints, drops.as_mut());
        } else if line == "mesh {" {
            let (next_line, mesh) = parse_mesh_block(&lines, index, drops.as_mut());
            index = next_line;
            meshes.push(mesh);
        }
    }
    if joints.is_empty() && meshes.is_empty() {
        report_import_diagnostic(
            diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Reject,
            "md5mesh.no-data",
            "parseMd5Mesh",
            None,
        );
    }
    let skin = {
        let mut context = Md5ParseContext {
            diagnostics: diagnostics.as_deref_mut(),
            document: &mut document,
            drops: drops.as_mut(),
            joints: &joints,
            mesh: None,
            skin: None,
        };
        for handler in section_handlers {
            let (feature, collect) = {
                let handler = handler.read().unwrap();
                (handler.feature.clone(), handler.collect.clone())
            };
            if feature == MD5_SKELETON_FEATURE {
                collect(&mut context);
            }
        }
        context.skin
    };
    let mut truncated_vertex_count = 0;
    let mut max_observed_influences = 0;
    for mesh in meshes {
        let mut vertices = Vec::new();
        let mut indices = Vec::new();
        let mut joint_scratch = vec![0.0; 4];
        let mut weight_scratch = vec![0.0; 4];
        for (vertex_index, vertex) in mesh.vertices.iter().enumerate() {
            let mut influences = Vec::new();
            for offset in 0..vertex.count_weights {
                let weight_index = vertex.start_weight as usize + offset as usize;
                if weight_index >= mesh.weights.len() {
                    tally_md5_drop(
                        drops.as_mut(),
                        ImportDiagnosticSeverity::Recover,
                        "md5mesh.vertex-weight-out-of-range",
                        "",
                        md5_number_detail(&[
                            ("firstIndex", weight_index as f32),
                            ("firstVertex", vertex_index as f32),
                        ]),
                    );
                    break;
                }
                let weight = &mesh.weights[weight_index];
                if weight.joint_index < 0 || weight.joint_index as usize >= joints.len() {
                    tally_md5_drop(
                        drops.as_mut(),
                        ImportDiagnosticSeverity::Recover,
                        "md5mesh.weight-joint-out-of-range",
                        "",
                        md5_number_detail(&[
                            ("firstIndex", weight.joint_index as f32),
                            ("firstWeight", weight_index as f32),
                        ]),
                    );
                    continue;
                }
                let joint = &joints[weight.joint_index as usize];
                let x = quat_rotate_vec3_x(joint, weight);
                let y = quat_rotate_vec3_y(joint, weight);
                let z = quat_rotate_vec3_z(joint, weight);
                influences.push(Md5WeightInfluence {
                    joint_index: weight.joint_index as f32,
                    mx: joint.position_x + x,
                    my: joint.position_y + y,
                    mz: joint.position_z + z,
                    weight: weight.bias,
                });
            }
            influences.sort_by(|a, b| {
                (b.weight - a.weight)
                    .partial_cmp(&0.0)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
            let kept = influences.len().min(MAX_SKIN_INFLUENCES);
            if influences.len() > MAX_SKIN_INFLUENCES {
                truncated_vertex_count += 1;
                max_observed_influences = max_observed_influences.max(influences.len());
            }
            let mut bias_sum = 0.0;
            for influence in &influences[..kept] {
                bias_sum += influence.weight;
            }
            let (mut px, mut py, mut pz) = (0.0, 0.0, 0.0);
            for influence in &influences[..kept] {
                let norm_weight = if bias_sum > 0.0 {
                    influence.weight / bias_sum
                } else {
                    0.0
                };
                px += norm_weight * influence.mx;
                py += norm_weight * influence.my;
                pz += norm_weight * influence.mz;
            }
            let mut packed: Vec<_> = influences
                .iter()
                .map(|value| SkinInfluence {
                    joint_index: value.joint_index,
                    weight: value.weight,
                })
                .collect();
            pack_skin_influences(&mut joint_scratch, &mut weight_scratch, &mut packed);
            vertices.extend_from_slice(&[
                px, py, pz, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, vertex.u, vertex.v,
            ]);
            vertices.extend_from_slice(&joint_scratch[..4]);
            vertices.extend_from_slice(&weight_scratch[..4]);
        }
        convert_positions_z_up_to_y_up(&mut vertices, Some(SKINNED_FLOATS_PER_VERTEX), Some(0));
        for (triangle, corners) in mesh.indices.chunks_exact(3).enumerate() {
            if let Some(invalid) = corners
                .iter()
                .find(|value| **value < 0.0 || **value >= mesh.vertices.len() as f32)
            {
                tally_md5_drop(
                    drops.as_mut(),
                    ImportDiagnosticSeverity::Drop,
                    "md5mesh.triangle-vertex-out-of-range",
                    "",
                    md5_number_detail(&[
                        ("firstCount", mesh.vertices.len() as f32),
                        ("firstIndex", *invalid),
                        ("firstTriangle", triangle as f32),
                    ]),
                );
                continue;
            }
            indices.extend_from_slice(corners);
        }
        reverse_triangle_winding(&mut indices);
        if indices.is_empty() {
            tally_md5_drop(
                drops.as_mut(),
                ImportDiagnosticSeverity::Drop,
                "md5mesh.mesh-empty",
                "",
                HashMap::new(),
            );
            continue;
        }
        let mut geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U32(IndexBufferU32 {
                data: Arc::new(RwLock::new(
                    indices
                        .iter()
                        .map(|value| *value as u32)
                        .collect::<Vec<_>>()
                        .into_boxed_slice(),
                )),
            })),
            layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT.clone(),
            vertices: vertices.into_boxed_slice(),
            subsets: None,
            topology: None,
        });
        let mut position_groups = Vec::new();
        compute_mesh_geometry_position_groups(&mut position_groups, &geometry);
        let normal_source = clone_mesh_geometry(&geometry);
        compute_mesh_geometry_normals(&mut geometry, &normal_source, Some(&position_groups));
        let tangent_source = clone_mesh_geometry(&geometry);
        compute_mesh_geometry_tangents(&mut geometry, &tangent_source, Some(&position_groups));
        canonicalize_md5_tangent_handedness(&mut geometry, drops.as_mut());
        let mut materials = Vec::new();
        for handler in section_handlers {
            let (feature, collect) = {
                let handler = handler.read().unwrap();
                (handler.feature.clone(), handler.collect.clone())
            };
            if feature == MD5_MATERIAL_FEATURE {
                let mut context = Md5ParseContext {
                    diagnostics: diagnostics.as_deref_mut(),
                    document: &mut document,
                    drops: drops.as_mut(),
                    joints: &joints,
                    mesh: Some(Md5MeshSection {
                        materials: &mut materials,
                        shader: &mesh.shader,
                    }),
                    skin,
                };
                collect(&mut context);
            }
        }
        let mesh_index = document.meshes.len() as i32;
        document.meshes.push(Scene3DDocumentMesh {
            geometry: Arc::new(RwLock::new(geometry)),
            materials,
            skin,
            morph: None,
            name: None,
        });
        let node_index = document.nodes.len() as i32;
        document.nodes.push(Scene3DDocumentNode {
            children: Vec::new(),
            kind: MESH_KIND.to_string(),
            mesh: Some(mesh_index),
            name: None,
            transform: create_transform3d(),
        });
        document.scenes[0].root_nodes.push(node_index);
    }
    if truncated_vertex_count > 0 {
        report_import_diagnostic(
            diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Recover,
            "md5mesh.vertex-over-influenced",
            "parseMd5Mesh",
            Some(md5_number_detail(&[
                ("count", truncated_vertex_count as f32),
                ("maxInfluences", max_observed_influences as f32),
            ])),
        );
    }
    if let Some(drops) = drops {
        for entry in drops {
            let mut detail = entry.value.detail;
            detail.insert(
                "count".to_string(),
                ImportDiagnosticDetailValue::Number(entry.value.count as f32),
            );
            report_import_diagnostic(
                diagnostics.as_deref_mut(),
                entry.value.severity,
                &entry.value.kind,
                "parseMd5Mesh",
                Some(detail),
            );
        }
    }
    return document;
}

fn parse_md5_record_ordinal(token: &str) -> Option<usize> {
    let value = parse_md5_integer(token)?;
    if token.starts_with('-') || value < 0.0 || value >= 1e21 || format!("{value:.0}") != token {
        return None;
    }
    return Some(value as usize);
}

fn parse_mesh_block(
    lines: &[&str],
    start_line: usize,
    mut drops: Option<&mut Vec<Md5DropTallyEntry>>,
) -> (usize, Md5Mesh) {
    let mut mesh = Md5Mesh {
        indices: Vec::new(),
        shader: String::new(),
        vertices: Vec::new(),
        weights: Vec::new(),
    };
    let mut triangles = Vec::new();
    let (mut declared_verts, mut declared_tris, mut declared_weights) = (None, None, None);
    let mut closed = false;
    let mut index = start_line;
    while index < lines.len() {
        let line = lines[index].trim_matches(is_md5_whitespace);
        index += 1;
        if line == "}" {
            closed = true;
            break;
        }
        if line.is_empty() || line.starts_with("//") {
            continue;
        }
        if line.starts_with("shader") {
            if let Some((name, _)) = quoted_md5_name(line) {
                mesh.shader = name.to_string();
            } else {
                tally_md5_drop(
                    drops.as_deref_mut(),
                    ImportDiagnosticSeverity::Recover,
                    "md5mesh.shader-unquoted",
                    "",
                    md5_number_detail(&[("firstLine", index as f32)]),
                );
            }
        } else if line.starts_with("numverts") {
            declared_verts = parse_md5_declared_count(line);
        } else if line.starts_with("numtris") {
            declared_tris = parse_md5_declared_count(line);
        } else if line.starts_with("numweights") {
            declared_weights = parse_md5_declared_count(line);
        } else if line.starts_with("vert ") {
            if let Some((ordinal, vertex)) = parse_vert_line(line, drops.as_deref_mut(), index - 1)
            {
                align_md5_records(
                    &mut mesh.vertices,
                    ordinal,
                    drops.as_deref_mut(),
                    "vert",
                    || Md5Vertex {
                        count_weights: 0,
                        start_weight: 0,
                        u: 0.0,
                        v: 0.0,
                    },
                );
                if ordinal == mesh.vertices.len() {
                    mesh.vertices.push(vertex);
                }
            }
        } else if line.starts_with("tri ") {
            if let Some((ordinal, triangle)) = parse_tri_line(line, drops.as_deref_mut(), index - 1)
            {
                align_md5_records(&mut triangles, ordinal, drops.as_deref_mut(), "tri", || {
                    [0.0; 3]
                });
                if ordinal == triangles.len() {
                    triangles.push(triangle);
                }
            }
        } else if line.starts_with("weight ") {
            if let Some((ordinal, weight)) =
                parse_weight_line(line, drops.as_deref_mut(), index - 1)
            {
                align_md5_records(
                    &mut mesh.weights,
                    ordinal,
                    drops.as_deref_mut(),
                    "weight",
                    || Md5Weight {
                        bias: 0.0,
                        joint_index: -1,
                        position_x: 0.0,
                        position_y: 0.0,
                        position_z: 0.0,
                    },
                );
                if ordinal == mesh.weights.len() {
                    mesh.weights.push(weight);
                }
            }
        }
    }
    for (record, declared, actual) in [
        ("vert", declared_verts, mesh.vertices.len()),
        ("tri", declared_tris, triangles.len()),
        ("weight", declared_weights, mesh.weights.len()),
    ] {
        report_md5_count_disagreement(drops.as_deref_mut(), record, declared, actual);
    }
    for triangle in triangles {
        mesh.indices.extend_from_slice(&triangle);
    }
    if !closed {
        tally_md5_drop(
            drops,
            ImportDiagnosticSeverity::Recover,
            "md5mesh.mesh-block-unclosed",
            "",
            HashMap::new(),
        );
    }
    return (index, mesh);
}

fn parse_tri_line(
    line: &str,
    drops: Option<&mut Vec<Md5DropTallyEntry>>,
    line_index: usize,
) -> Option<(usize, [f32; 3])> {
    let tokens: Vec<_> = line
        .split(is_md5_whitespace)
        .filter(|value| !value.is_empty())
        .collect();
    if tokens.len() < 5 {
        md5_malformed(drops, "tri", "not-enough-components", line_index);
        return None;
    }
    let values = [
        parse_md5_integer(&tokens[2]),
        parse_md5_integer(&tokens[3]),
        parse_md5_integer(&tokens[4]),
    ];
    if values.iter().any(Option::is_none) {
        md5_malformed(drops, "tri", "non-numeric", line_index);
        return None;
    }
    let Some(index) = parse_md5_record_ordinal(&tokens[1]) else {
        md5_malformed(drops, "tri", "bad-index", line_index);
        return None;
    };
    return Some((index, values.map(|value| value.unwrap() as f32)));
}

fn parse_vert_line(
    line: &str,
    drops: Option<&mut Vec<Md5DropTallyEntry>>,
    line_index: usize,
) -> Option<(usize, Md5Vertex)> {
    let tokens = split_md5_components(line);
    if tokens.len() < 6 {
        md5_malformed(drops, "vert", "not-enough-components", line_index);
        return None;
    }
    let values = [
        parse_md5_float(&tokens[2]),
        parse_md5_float(&tokens[3]),
        parse_md5_integer(&tokens[4]),
        parse_md5_integer(&tokens[5]),
    ];
    if values.iter().any(Option::is_none) {
        md5_malformed(drops, "vert", "non-numeric", line_index);
        return None;
    }
    let values = values.map(Option::unwrap);
    if values[2] < 0.0 || values[3] <= 0.0 {
        md5_malformed(drops, "vert", "weight-range", line_index);
        return None;
    }
    let Some(index) = parse_md5_record_ordinal(&tokens[1]) else {
        md5_malformed(drops, "vert", "bad-index", line_index);
        return None;
    };
    return Some((
        index,
        Md5Vertex {
            u: values[0] as f32,
            v: values[1] as f32,
            start_weight: values[2] as i32,
            count_weights: values[3] as i32,
        },
    ));
}

fn parse_weight_line(
    line: &str,
    drops: Option<&mut Vec<Md5DropTallyEntry>>,
    line_index: usize,
) -> Option<(usize, Md5Weight)> {
    let tokens = split_md5_components(line);
    if tokens.len() < 7 {
        md5_malformed(drops, "weight", "not-enough-components", line_index);
        return None;
    }
    let values = [
        parse_md5_integer(&tokens[2]),
        parse_md5_float(&tokens[3]),
        parse_md5_float(&tokens[4]),
        parse_md5_float(&tokens[5]),
        parse_md5_float(&tokens[6]),
    ];
    if values.iter().any(Option::is_none) {
        md5_malformed(drops, "weight", "non-numeric", line_index);
        return None;
    }
    let Some(index) = parse_md5_record_ordinal(&tokens[1]) else {
        md5_malformed(drops, "weight", "bad-index", line_index);
        return None;
    };
    let values = values.map(Option::unwrap);
    return Some((
        index,
        Md5Weight {
            joint_index: values[0] as i32,
            bias: values[1] as f32,
            position_x: values[2] as f32,
            position_y: values[3] as f32,
            position_z: values[4] as f32,
        },
    ));
}

fn quat_rotate_vec3_x(joint: &Md5Joint, weight: &Md5Weight) -> f32 {
    let tx =
        2.0 * (joint.orientation_y * weight.position_z - joint.orientation_z * weight.position_y);
    let ty =
        2.0 * (joint.orientation_z * weight.position_x - joint.orientation_x * weight.position_z);
    let tz =
        2.0 * (joint.orientation_x * weight.position_y - joint.orientation_y * weight.position_x);
    return weight.position_x
        + joint.orientation_w * tx
        + (joint.orientation_y * tz - joint.orientation_z * ty);
}
fn quat_rotate_vec3_y(joint: &Md5Joint, weight: &Md5Weight) -> f32 {
    let tx =
        2.0 * (joint.orientation_y * weight.position_z - joint.orientation_z * weight.position_y);
    let ty =
        2.0 * (joint.orientation_z * weight.position_x - joint.orientation_x * weight.position_z);
    let tz =
        2.0 * (joint.orientation_x * weight.position_y - joint.orientation_y * weight.position_x);
    return weight.position_y
        + joint.orientation_w * ty
        + (joint.orientation_z * tx - joint.orientation_x * tz);
}
fn quat_rotate_vec3_z(joint: &Md5Joint, weight: &Md5Weight) -> f32 {
    let tx =
        2.0 * (joint.orientation_y * weight.position_z - joint.orientation_z * weight.position_y);
    let ty =
        2.0 * (joint.orientation_z * weight.position_x - joint.orientation_x * weight.position_z);
    let tz =
        2.0 * (joint.orientation_x * weight.position_y - joint.orientation_y * weight.position_x);
    return weight.position_z
        + joint.orientation_w * tz
        + (joint.orientation_x * ty - joint.orientation_y * tx);
}

fn quoted_md5_name(line: &str) -> Option<(&str, &str)> {
    let start = line.find('"')? + 1;
    let end = start + line[start..].find('"')?;
    return Some((&line[start..end], &line[end + 1..]));
}

fn report_md5_count_disagreement(
    drops: Option<&mut Vec<Md5DropTallyEntry>>,
    record: &str,
    declared: Option<usize>,
    actual: usize,
) {
    if let Some(declared) = declared {
        if declared != actual {
            tally_md5_drop(
                drops,
                ImportDiagnosticSeverity::Recover,
                &format!("md5mesh.{record}-count-mismatch"),
                record,
                md5_number_detail(&[
                    ("firstActual", actual as f32),
                    ("firstExpected", declared as f32),
                ]),
            );
        }
    }
}

fn split_md5_components(line: &str) -> Vec<String> {
    return line
        .replace('(', "")
        .replace(')', "")
        .split(is_md5_whitespace)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect();
}

pub fn tally_md5_drop(
    tallies: Option<&mut Vec<Md5DropTallyEntry>>,
    severity: ImportDiagnosticSeverity,
    kind: &str,
    discriminator: &str,
    first_detail: HashMap<String, ImportDiagnosticDetailValue>,
) {
    let Some(tallies) = tallies else {
        return;
    };
    let key = format!("{kind}|{discriminator}");
    if let Some(existing) = tallies.iter_mut().find(|entry| entry.key == key) {
        existing.value.count += 1;
    } else {
        tallies.push(Md5DropTallyEntry {
            key,
            value: Md5DropTally {
                count: 1,
                detail: first_detail,
                kind: kind.to_string(),
                severity,
            },
        });
    }
}
