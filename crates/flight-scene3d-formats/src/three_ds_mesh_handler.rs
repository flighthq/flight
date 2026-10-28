use crate::shared::{CANONICAL_FLOATS_PER_VERTEX, CANONICAL_LAYOUT, create_external_texture_ref};
use crate::three_ds_parse::{
    pack_three_ds_color, read_chunk_end, read_chunk_length, read_null_terminated_string,
    tally_three_ds_drop,
};
use crate::three_ds_read::{read_three_ds_f32, read_three_ds_u16, read_three_ds_u32};
use crate::three_ds_schema::*;
use crate::three_ds_types::{
    ThreeDsChunkHandler, ThreeDsDropTallyEntry, ThreeDsMaterialEntry, ThreeDsPivotEntry,
};
use flight_entity::{Float64Array, Ref, Uint8Array};
use flight_geometry::contract::{
    Matrix4, Transform3D, clone_matrix4, clone_vector3, create_matrix4, create_transform3d,
    create_vector3, decompose_matrix4_to_transform3d, inverse_matrix4, matrix4_transform_point,
    multiply_matrix4, set_matrix4,
};
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_materials::contract::create_blinn_phong_material;
use flight_materials::{Material, Material3D, MaterialAlphaMode};
use flight_meshgeometry::{
    IndexBuffer, IndexBufferU32, MeshGeometryOptions, MeshSubset, create_mesh_geometry,
};
use flight_scene3d::{
    MESH_KIND, Scene3DDocument, Scene3DDocumentMaterial, Scene3DDocumentMaterialEntity,
    Scene3DDocumentMesh, Scene3DDocumentNode,
};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

struct ThreeDsFaces {
    faces: Box<[u16]>,
    material_groups: Vec<ThreeDsMaterialGroup>,
    smoothing_groups: Option<Box<[u32]>>,
}

// flight-lint: allow(f64) exact source Float64Array-derived normal slots retain double accumulation/comparison until the canonical Float32Array vertex write
struct ThreeDsNormalSlot {
    nx: f64,
    ny: f64,
    nz: f64,
    out_index: u32,
}

// flight-lint: allow(f64) source Float64Array faceNormals scratch and Foreman80958601 private number[] position staging through pivot/axis arithmetic until final canonical writes
struct ThreeDsMeshEmitter<'a> {
    face_group: Vec<i32>,
    face_normals: Box<Float64Array>,
    face_valid: Vec<bool>,
    faces: &'a [u16],
    incident_faces: Vec<Vec<usize>>,
    indices: Vec<u32>,
    mesh: &'a ThreeDsMesh,
    mesh_materials: Vec<i32>,
    out_vertices: Vec<f32>,
    positions: &'a [f64],
    subsets: Vec<MeshSubset>,
    vertex_slots: Vec<Vec<ThreeDsNormalSlot>>,
}

pub static THREE_DS_MESH_HANDLER: LazyLock<Ref<ThreeDsChunkHandler>> = LazyLock::new(|| {
    Arc::new(RwLock::new(ThreeDsChunkHandler {
        chunk_ids: vec![THREE_DS_TRIMESH],
        collect: Arc::new(|state, view, offset, end, name| {
            if let Some(mesh) =
                parse_three_ds_trimesh(view, offset, end, name, state.drops.as_mut())
            {
                state.meshes.push(mesh);
            }
        }),
        build: Some(Arc::new(|state| {
            let mut material_index_by_name = HashMap::new();
            for mesh in &state.meshes {
                append_mesh_document(
                    state.document,
                    mesh,
                    &state.materials,
                    &mut material_index_by_name,
                    &state.pivots,
                    state.drops.as_mut(),
                );
            }
        })),
    }))
});
pub static THREE_DS_MESH_FAMILY: LazyLock<Vec<Ref<ThreeDsChunkHandler>>> =
    LazyLock::new(|| vec![THREE_DS_MESH_HANDLER.clone()]);
static THREE_DS_Z_UP_TO_Y_UP: LazyLock<Matrix4> = LazyLock::new(|| {
    let mut matrix = create_matrix4();
    set_matrix4(
        &mut matrix,
        1.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        -1.0,
        0.0,
        0.0,
        1.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        1.0,
    );
    return matrix;
});
static THREE_DS_Y_UP_TO_Z_UP: LazyLock<Matrix4> = LazyLock::new(|| {
    let mut matrix = create_matrix4();
    set_matrix4(
        &mut matrix,
        1.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        1.0,
        0.0,
        0.0,
        -1.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        1.0,
    );
    return matrix;
});

// flight-lint: allow(f64) Foreman80958601 source Array.from(vertices) positions retain Number precision through pivot/axis operations and explicit Float64Array normal crosses until final canonical vertex writes
fn append_mesh_document(
    document: &mut Scene3DDocument,
    mesh: &ThreeDsMesh,
    materials: &[ThreeDsMaterialEntry],
    material_index_by_name: &mut HashMap<String, i32>,
    pivots: &[ThreeDsPivotEntry],
    mut drops: Option<&mut Vec<ThreeDsDropTallyEntry>>,
) {
    let vertex_count = mesh.vertices.len() / 3;
    let face_count = mesh.faces.len() / 3;
    if vertex_count == 0 || face_count == 0 {
        tally_three_ds_drop(
            drops,
            ImportDiagnosticSeverity::Drop,
            "3ds.mesh-empty",
            "",
            detail_name(&mesh.name),
        );
        return;
    }
    let mut positions: Vec<f64> = mesh.vertices.iter().map(|value| *value as f64).collect();
    let mut transform = create_transform3d();
    let pivot = pivots
        .iter()
        .find(|pivot| pivot.key == mesh.name)
        .map(|pivot| &pivot.value);
    let mut localized = false;
    if let Some(local_matrix) = mesh.local_matrix.as_deref() {
        localized = localize_three_ds_positions(
            &mut transform,
            &mut positions,
            local_matrix,
            pivot,
            &mesh.name,
            drops.as_deref_mut(),
        );
    }
    let reversed = if localized
        && mesh
            .local_matrix
            .as_ref()
            .is_some_and(|matrix| three_ds_local_matrix_determinant(matrix) < 0.0)
    {
        Some(reverse_three_ds_face_winding(&mesh.faces))
    } else {
        None
    };
    let faces = reversed.as_deref().unwrap_or(&mesh.faces);
    // Same source Z-up permutation on the approved private Number buffer, without a premature f32 store.
    for position in positions.chunks_exact_mut(3) {
        let y = position[1];
        position[1] = position[2];
        position[2] = -y + 0.0;
    }
    let mut face_normals = vec![0.0; face_count * 3].into_boxed_slice();
    let mut incident_faces = vec![Vec::new(); vertex_count];
    let mut face_valid = vec![false; face_count];
    let mut dropped_faces = 0;
    for face in 0..face_count {
        let [i0, i1, i2] = [
            faces[face * 3] as usize,
            faces[face * 3 + 1] as usize,
            faces[face * 3 + 2] as usize,
        ];
        if i0 >= vertex_count || i1 >= vertex_count || i2 >= vertex_count {
            dropped_faces += 1;
            continue;
        }
        face_valid[face] = true;
        let e1x = positions[i1 * 3] - positions[i0 * 3];
        let e1y = positions[i1 * 3 + 1] - positions[i0 * 3 + 1];
        let e1z = positions[i1 * 3 + 2] - positions[i0 * 3 + 2];
        let e2x = positions[i2 * 3] - positions[i0 * 3];
        let e2y = positions[i2 * 3 + 1] - positions[i0 * 3 + 1];
        let e2z = positions[i2 * 3 + 2] - positions[i0 * 3 + 2];
        face_normals[face * 3] = e1y * e2z - e1z * e2y;
        face_normals[face * 3 + 1] = e1z * e2x - e1x * e2z;
        face_normals[face * 3 + 2] = e1x * e2y - e1y * e2x;
        incident_faces[i0].push(face);
        incident_faces[i1].push(face);
        incident_faces[i2].push(face);
    }
    if dropped_faces > 0 {
        let mut detail = detail_name(&mesh.name);
        detail.insert(
            "firstDroppedFaces".to_string(),
            ImportDiagnosticDetailValue::Number(dropped_faces as f32),
        );
        detail.insert(
            "firstVertexCount".to_string(),
            ImportDiagnosticDetailValue::Number(vertex_count as f32),
        );
        tally_three_ds_drop(
            drops.as_deref_mut(),
            ImportDiagnosticSeverity::Drop,
            "3ds.face-index-out-of-range",
            "",
            detail,
        );
    }
    let mut emitter = ThreeDsMeshEmitter {
        face_group: vec![-1; face_count],
        face_normals,
        face_valid,
        faces,
        incident_faces,
        indices: Vec::new(),
        mesh,
        mesh_materials: Vec::new(),
        out_vertices: Vec::new(),
        positions: &positions,
        subsets: Vec::new(),
        vertex_slots: (0..vertex_count).map(|_| Vec::new()).collect(),
    };
    for (group_index, group) in mesh.material_groups.iter().enumerate() {
        for face in &group.faces {
            emitter.face_group[*face as usize] = group_index as i32;
        }
    }
    for (group_index, group) in mesh.material_groups.iter().enumerate() {
        let index = resolve_three_ds_material(
            document,
            &group.name,
            materials,
            material_index_by_name,
            drops.as_deref_mut(),
        );
        emit_three_ds_subset(&mut emitter, group_index as i32, index);
    }
    emit_three_ds_subset(&mut emitter, -1, -1);
    if emitter.subsets.is_empty() {
        return;
    }
    let geometry = create_mesh_geometry(MeshGeometryOptions {
        indices: Some(IndexBuffer::U32(IndexBufferU32 {
            data: Arc::new(RwLock::new(emitter.indices.into_boxed_slice())),
        })),
        layout: CANONICAL_LAYOUT.clone(),
        subsets: Some(emitter.subsets),
        vertices: emitter.out_vertices.into_boxed_slice(),
        topology: None,
    });
    let mesh_index = document.meshes.len() as i32;
    document.meshes.push(Scene3DDocumentMesh {
        geometry: Arc::new(RwLock::new(geometry)),
        materials: emitter.mesh_materials,
        skin: None,
        morph: None,
        name: None,
    });
    let node_index = document.nodes.len() as i32;
    document.nodes.push(Scene3DDocumentNode {
        children: Vec::new(),
        kind: MESH_KIND.to_string(),
        mesh: Some(mesh_index),
        transform,
        name: if mesh.name.is_empty() {
            None
        } else {
            Some(mesh.name.clone())
        },
    });
    document.scenes[0].root_nodes.push(node_index);
}

fn detail_name(name: &str) -> HashMap<String, ImportDiagnosticDetailValue> {
    return HashMap::from([(
        "firstName".to_string(),
        ImportDiagnosticDetailValue::String(name.to_string()),
    )]);
}

// flight-lint: allow(f64) exact source Float64Array-derived incident-face sum and normal-slot comparison round only at the emitted canonical Float32Array vertex write
fn emit_three_ds_corner(out: &mut ThreeDsMeshEmitter, face: usize, vertex: usize) -> u32 {
    let (mut nx, mut ny, mut nz) = (0.0, 0.0, 0.0);
    for other in &out.incident_faces[vertex] {
        if *other == face
            || out
                .mesh
                .smoothing_groups
                .as_ref()
                .is_none_or(|groups| groups[face] & groups[*other] != 0)
        {
            nx += out.face_normals[*other * 3];
            ny += out.face_normals[*other * 3 + 1];
            nz += out.face_normals[*other * 3 + 2];
        }
    }
    let length = (nx * nx + ny * ny + nz * nz).sqrt();
    if length > 0.0 {
        nx /= length;
        ny /= length;
        nz /= length;
    }
    for slot in &out.vertex_slots[vertex] {
        if (slot.nx - nx).abs() < 1e-6 && (slot.ny - ny).abs() < 1e-6 && (slot.nz - nz).abs() < 1e-6
        {
            return slot.out_index;
        }
    }
    let index = (out.out_vertices.len() / CANONICAL_FLOATS_PER_VERTEX) as u32;
    for position in &out.positions[vertex * 3..vertex * 3 + 3] {
        out.out_vertices.push(*position as f32);
    }
    out.out_vertices
        .extend_from_slice(&[nx as f32, ny as f32, nz as f32, 0.0, 0.0, 0.0, 0.0]);
    if let Some(uvs) = &out.mesh.uvs {
        if vertex < uvs.len() / 2 {
            out.out_vertices
                .extend_from_slice(&[uvs[vertex * 2], 1.0 - uvs[vertex * 2 + 1]]);
        } else {
            out.out_vertices.extend_from_slice(&[0.0; 2]);
        }
    } else {
        out.out_vertices.extend_from_slice(&[0.0; 2]);
    }
    out.vertex_slots[vertex].push(ThreeDsNormalSlot {
        nx,
        ny,
        nz,
        out_index: index,
    });
    return index;
}

fn emit_three_ds_subset(out: &mut ThreeDsMeshEmitter, group: i32, material_index: i32) {
    let index_offset = out.indices.len();
    for face in 0..out.face_valid.len() {
        if !out.face_valid[face] || out.face_group[face] != group {
            continue;
        }
        for corner in 0..3 {
            let index = emit_three_ds_corner(out, face, out.faces[face * 3 + corner] as usize);
            out.indices.push(index);
        }
    }
    let index_count = out.indices.len() - index_offset;
    if index_count > 0 {
        out.subsets.push(MeshSubset {
            index_count: index_count as u32,
            index_offset: index_offset as u32,
        });
        out.mesh_materials.push(material_index);
    }
}

// flight-lint: allow(f64) Foreman80958601 private source number[] pivot subtraction follows canonical f32 matrix-point results widened losslessly; public inverse/matrix/transform types and operations remain unchanged
fn localize_three_ds_positions(
    out: &mut Transform3D,
    positions: &mut [f64],
    local_matrix: &[f32],
    pivot: Option<&[f32; 3]>,
    name: &str,
    drops: Option<&mut Vec<ThreeDsDropTallyEntry>>,
) -> bool {
    let mut placement = create_matrix4();
    set_matrix4(
        &mut placement,
        local_matrix[0],
        local_matrix[1],
        local_matrix[2],
        0.0,
        local_matrix[3],
        local_matrix[4],
        local_matrix[5],
        0.0,
        local_matrix[6],
        local_matrix[7],
        local_matrix[8],
        0.0,
        local_matrix[9],
        local_matrix[10],
        local_matrix[11],
        1.0,
    );
    let mut inverse = create_matrix4();
    if !inverse_matrix4(&mut inverse, &placement) {
        tally_three_ds_drop(
            drops,
            ImportDiagnosticSeverity::Recover,
            "3ds.local-matrix-singular",
            "",
            detail_name(name),
        );
        return false;
    }
    let mut point = create_vector3(0.0, 0.0, 0.0);
    for position in positions.chunks_exact_mut(3) {
        point.x = position[0] as f32;
        point.y = position[1] as f32;
        point.z = position[2] as f32;
        let source = clone_vector3(&point);
        matrix4_transform_point(&mut point, &inverse, &source);
        position.copy_from_slice(&[point.x as f64, point.y as f64, point.z as f64]);
    }
    if let Some(pivot) = pivot {
        for position in positions.chunks_exact_mut(3) {
            position[0] -= pivot[0] as f64;
            position[1] -= pivot[1] as f64;
            position[2] -= pivot[2] as f64;
        }
        let mut pivot_translation = create_matrix4();
        set_matrix4(
            &mut pivot_translation,
            1.0,
            0.0,
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
            pivot[0],
            pivot[1],
            pivot[2],
            1.0,
        );
        let source = clone_matrix4(&placement);
        multiply_matrix4(&mut placement, &source, &pivot_translation);
    }
    let mut conjugated = create_matrix4();
    multiply_matrix4(&mut conjugated, &THREE_DS_Z_UP_TO_Y_UP, &placement);
    let source = clone_matrix4(&conjugated);
    multiply_matrix4(&mut conjugated, &source, &THREE_DS_Y_UP_TO_Z_UP);
    decompose_matrix4_to_transform3d(out, &conjugated);
    return true;
}

fn parse_face_material_group(
    view: &Uint8Array,
    data_start: usize,
    end: usize,
    face_count: usize,
    mut drops: Option<&mut Vec<ThreeDsDropTallyEntry>>,
) -> Option<ThreeDsMaterialGroup> {
    let name = read_null_terminated_string(view, data_start, end);
    if name.is_empty() {
        return None;
    }
    let mut offset = data_start + name.chars().count() + 1;
    if offset + 2 > end {
        let mut detail = detail_name(&name);
        detail.insert(
            "reason".to_string(),
            ImportDiagnosticDetailValue::String("no-count".to_string()),
        );
        tally_three_ds_drop(
            drops,
            ImportDiagnosticSeverity::Drop,
            "3ds.material-group-truncated",
            "no-count",
            detail,
        );
        return None;
    }
    let group_face_count = read_three_ds_u16(view, offset) as usize;
    offset += 2;
    if offset + group_face_count * 2 > end {
        let mut detail = detail_name(&name);
        detail.insert(
            "firstCount".to_string(),
            ImportDiagnosticDetailValue::Number(group_face_count as f32),
        );
        detail.insert(
            "reason".to_string(),
            ImportDiagnosticDetailValue::String("truncated".to_string()),
        );
        tally_three_ds_drop(
            drops,
            ImportDiagnosticSeverity::Drop,
            "3ds.material-group-truncated",
            "truncated",
            detail,
        );
        return None;
    }
    let mut faces = Vec::new();
    for index in 0..group_face_count {
        let face = read_three_ds_u16(view, offset + index * 2);
        if (face as usize) < face_count {
            faces.push(face);
        }
    }
    if faces.len() < group_face_count {
        let mut detail = detail_name(&name);
        detail.insert(
            "firstFaceCount".to_string(),
            ImportDiagnosticDetailValue::Number(face_count as f32),
        );
        tally_three_ds_drop(
            drops.as_deref_mut(),
            ImportDiagnosticSeverity::Recover,
            "3ds.material-group-face-out-of-range",
            "",
            detail,
        );
    }
    return Some(ThreeDsMaterialGroup {
        faces: faces.into_boxed_slice(),
        name,
    });
}

fn parse_faces(
    view: &Uint8Array,
    data_start: usize,
    end: usize,
    mut drops: Option<&mut Vec<ThreeDsDropTallyEntry>>,
) -> Option<ThreeDsFaces> {
    if data_start + 2 > end {
        truncated(
            drops,
            ImportDiagnosticSeverity::Drop,
            "3ds.faces-truncated",
            None,
        );
        return None;
    }
    let count = read_three_ds_u16(view, data_start) as usize;
    let faces_end = data_start + 2 + count * 8;
    if faces_end > end {
        truncated(
            drops,
            ImportDiagnosticSeverity::Drop,
            "3ds.faces-truncated",
            Some(count),
        );
        return None;
    }
    let mut faces = Vec::new();
    for face in 0..count {
        for corner in 0..3 {
            faces.push(read_three_ds_u16(
                view,
                data_start + 2 + face * 8 + corner * 2,
            ));
        }
    }
    let mut parsed = ThreeDsFaces {
        faces: faces.into_boxed_slice(),
        material_groups: Vec::new(),
        smoothing_groups: None,
    };
    let mut cursor = faces_end;
    while cursor + THREE_DS_CHUNK_HEADER_BYTES <= end {
        let sub_id = read_three_ds_u16(view, cursor);
        let sub_length = read_chunk_length(view, cursor) as usize;
        let sub_end = cursor + sub_length;
        if sub_length < THREE_DS_CHUNK_HEADER_BYTES || sub_end > end {
            tally_three_ds_drop(
                drops.as_deref_mut(),
                ImportDiagnosticSeverity::Recover,
                "3ds.face-subchunk-exceeds",
                "",
                HashMap::new(),
            );
            break;
        }
        let data_offset = cursor + THREE_DS_CHUNK_HEADER_BYTES;
        if sub_id == THREE_DS_FACE_MATERIAL {
            if let Some(group) =
                parse_face_material_group(view, data_offset, sub_end, count, drops.as_deref_mut())
            {
                parsed.material_groups.push(group);
            }
        } else if sub_id == THREE_DS_SMOOTH_GROUP {
            parsed.smoothing_groups =
                parse_smoothing_groups(view, data_offset, sub_end, count, drops.as_deref_mut());
        }
        cursor = sub_end;
    }
    return Some(parsed);
}

fn parse_local_matrix(
    view: &Uint8Array,
    offset: usize,
    end: usize,
    name: &str,
    drops: Option<&mut Vec<ThreeDsDropTallyEntry>>,
) -> Option<Box<[f32]>> {
    if offset + 48 > end {
        tally_three_ds_drop(
            drops,
            ImportDiagnosticSeverity::Recover,
            "3ds.local-matrix-truncated",
            "",
            detail_name(name),
        );
        return None;
    }
    return Some(
        (0..12)
            .map(|index| read_three_ds_f32(view, offset + index * 4))
            .collect::<Vec<_>>()
            .into_boxed_slice(),
    );
}

fn parse_smoothing_groups(
    view: &Uint8Array,
    data_start: usize,
    end: usize,
    face_count: usize,
    drops: Option<&mut Vec<ThreeDsDropTallyEntry>>,
) -> Option<Box<[u32]>> {
    if data_start + face_count * 4 > end {
        tally_three_ds_drop(
            drops,
            ImportDiagnosticSeverity::Recover,
            "3ds.smoothing-truncated",
            "",
            HashMap::from([(
                "firstFaceCount".to_string(),
                ImportDiagnosticDetailValue::Number(face_count as f32),
            )]),
        );
        return None;
    }
    return Some(
        (0..face_count)
            .map(|index| read_three_ds_u32(view, data_start + index * 4))
            .collect::<Vec<_>>()
            .into_boxed_slice(),
    );
}

pub fn parse_three_ds_trimesh(
    view: &Uint8Array,
    offset: usize,
    end: usize,
    name: &str,
    mut three_ds_drops: Option<&mut Vec<ThreeDsDropTallyEntry>>,
) -> Option<ThreeDsMesh> {
    let (mut vertices, mut faces, mut uvs, mut local_matrix, mut smoothing_groups) =
        (None, None, None, None, None);
    let mut material_groups = Vec::new();
    let mut cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
    while cursor + THREE_DS_CHUNK_HEADER_BYTES <= end {
        let chunk_id = read_three_ds_u16(view, cursor);
        let chunk_end = read_chunk_end(view, cursor, end);
        if chunk_end < 0 {
            let mut detail = detail_name(name);
            detail.insert(
                "firstChunkId".to_string(),
                ImportDiagnosticDetailValue::Number(chunk_id as f32),
            );
            tally_three_ds_drop(
                three_ds_drops.as_deref_mut(),
                ImportDiagnosticSeverity::Recover,
                "3ds.subchunk-exceeds-trimesh",
                "",
                detail,
            );
            break;
        }
        let chunk_end = chunk_end as usize;
        let data_start = cursor + THREE_DS_CHUNK_HEADER_BYTES;
        match chunk_id {
            THREE_DS_VERTICES => {
                vertices =
                    parse_vertices(view, data_start, chunk_end, three_ds_drops.as_deref_mut())
            }
            THREE_DS_FACES => {
                if let Some(parsed) =
                    parse_faces(view, data_start, chunk_end, three_ds_drops.as_deref_mut())
                {
                    faces = Some(parsed.faces);
                    material_groups = parsed.material_groups;
                    smoothing_groups = parsed.smoothing_groups;
                }
            }
            THREE_DS_UV_COORDS => {
                uvs = parse_uv_coords(view, data_start, chunk_end, three_ds_drops.as_deref_mut())
            }
            THREE_DS_TRANSFORM_MATRIX => {
                local_matrix = parse_local_matrix(
                    view,
                    data_start,
                    chunk_end,
                    name,
                    three_ds_drops.as_deref_mut(),
                )
            }
            _ => {}
        }
        cursor = chunk_end;
    }
    if vertices.is_none() || faces.is_none() {
        let missing = if vertices.is_none() {
            "vertices"
        } else {
            "faces"
        };
        let mut detail = detail_name(name);
        detail.insert(
            "missing".to_string(),
            ImportDiagnosticDetailValue::String(missing.to_string()),
        );
        tally_three_ds_drop(
            three_ds_drops,
            ImportDiagnosticSeverity::Drop,
            "3ds.mesh-missing-geometry",
            missing,
            detail,
        );
        return None;
    }
    return Some(ThreeDsMesh {
        faces: faces.unwrap(),
        local_matrix,
        material_groups,
        name: name.to_string(),
        smoothing_groups,
        uvs,
        vertices: vertices.unwrap(),
    });
}

fn parse_uv_coords(
    view: &Uint8Array,
    data_start: usize,
    end: usize,
    drops: Option<&mut Vec<ThreeDsDropTallyEntry>>,
) -> Option<Box<[f32]>> {
    if data_start + 2 > end {
        truncated(
            drops,
            ImportDiagnosticSeverity::Recover,
            "3ds.uv-truncated",
            None,
        );
        return None;
    }
    let count = read_three_ds_u16(view, data_start) as usize;
    let needed = count * 2;
    if data_start + 2 + needed * 4 > end {
        truncated(
            drops,
            ImportDiagnosticSeverity::Recover,
            "3ds.uv-truncated",
            Some(count),
        );
        return None;
    }
    return Some(
        (0..needed)
            .map(|index| read_three_ds_f32(view, data_start + 2 + index * 4))
            .collect::<Vec<_>>()
            .into_boxed_slice(),
    );
}

fn parse_vertices(
    view: &Uint8Array,
    data_start: usize,
    end: usize,
    drops: Option<&mut Vec<ThreeDsDropTallyEntry>>,
) -> Option<Box<[f32]>> {
    if data_start + 2 > end {
        truncated(
            drops,
            ImportDiagnosticSeverity::Drop,
            "3ds.vertices-truncated",
            None,
        );
        return None;
    }
    let count = read_three_ds_u16(view, data_start) as usize;
    let needed = count * 3;
    if data_start + 2 + needed * 4 > end {
        truncated(
            drops,
            ImportDiagnosticSeverity::Drop,
            "3ds.vertices-truncated",
            Some(count),
        );
        return None;
    }
    return Some(
        (0..needed)
            .map(|index| read_three_ds_f32(view, data_start + 2 + index * 4))
            .collect::<Vec<_>>()
            .into_boxed_slice(),
    );
}

fn resolve_three_ds_material(
    document: &mut Scene3DDocument,
    name: &str,
    materials: &[ThreeDsMaterialEntry],
    material_index_by_name: &mut HashMap<String, i32>,
    drops: Option<&mut Vec<ThreeDsDropTallyEntry>>,
) -> i32 {
    if name.is_empty() {
        return -1;
    }
    let Some(parsed) = materials.iter().find(|entry| entry.key == name) else {
        tally_three_ds_drop(
            drops,
            ImportDiagnosticSeverity::Drop,
            "3ds.material-missing",
            "",
            detail_name(name),
        );
        return -1;
    };
    if let Some(index) = material_index_by_name.get(name) {
        return *index;
    }
    let index = document.materials.len() as i32;
    let material = three_ds_material_to_blinn_phong(document, &parsed.value);
    document.materials.push(Scene3DDocumentMaterial::Entity(
        Scene3DDocumentMaterialEntity { material },
    ));
    material_index_by_name.insert(name.to_string(), index);
    return index;
}

fn reverse_three_ds_face_winding(faces: &[u16]) -> Box<[u16]> {
    let mut reversed = faces.to_vec();
    for triangle in reversed.chunks_exact_mut(3) {
        triangle.swap(1, 2);
    }
    return reversed.into_boxed_slice();
}

fn three_ds_local_matrix_determinant(local_matrix: &[f32]) -> f32 {
    return local_matrix[0]
        * (local_matrix[4] * local_matrix[8] - local_matrix[5] * local_matrix[7])
        - local_matrix[3]
            * (local_matrix[1] * local_matrix[8] - local_matrix[2] * local_matrix[7])
        + local_matrix[6]
            * (local_matrix[1] * local_matrix[5] - local_matrix[2] * local_matrix[4]);
}

fn three_ds_material_to_blinn_phong(
    document: &mut Scene3DDocument,
    material: &ThreeDsMaterial,
) -> Ref<dyn Material3D> {
    let alpha_map = material
        .opacity_filename
        .as_deref()
        .map(|filename| create_external_texture_ref(filename, None, Some(&mut document.resources)));
    let diffuse_map = material
        .texture_filename
        .as_deref()
        .map(|filename| create_external_texture_ref(filename, None, Some(&mut document.resources)));
    let mut result = create_blinn_phong_material();
    result.alpha_map = alpha_map;
    result.diffuse = pack_three_ds_color(&material.diffuse, Some(material.opacity));
    result.diffuse_map = diffuse_map;
    result.specular = pack_three_ds_color(&material.specular, None);
    result.shininess = material.shininess.unwrap_or(32.0);
    result.material_fields_mut().name = if material.name.is_empty() {
        None
    } else {
        Some(material.name.clone())
    };
    if material.opacity < 1.0 || material.opacity_filename.is_some() {
        result.material3d_fields_mut().alpha_mode = MaterialAlphaMode::Blend;
    }
    return Arc::new(RwLock::new(result));
}

fn truncated(
    drops: Option<&mut Vec<ThreeDsDropTallyEntry>>,
    severity: ImportDiagnosticSeverity,
    kind: &str,
    count: Option<usize>,
) {
    let reason = if count.is_some() {
        "truncated"
    } else {
        "no-count"
    };
    let mut detail = HashMap::from([(
        "reason".to_string(),
        ImportDiagnosticDetailValue::String(reason.to_string()),
    )]);
    if let Some(count) = count {
        detail.insert(
            "firstCount".to_string(),
            ImportDiagnosticDetailValue::Number(count as f32),
        );
    }
    tally_three_ds_drop(drops, severity, kind, reason, detail);
}
