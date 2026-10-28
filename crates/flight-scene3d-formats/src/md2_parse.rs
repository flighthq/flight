use crate::md2_schema::{
    MD2_ANORMS, MD2_COMPRESSED_VERTEX_SIZE, MD2_FRAME_HEADER_SIZE, MD2_FRAME_NAME_SIZE,
    MD2_HEADER_SIZE, MD2_MAGIC, MD2_SKIN_SIZE, MD2_TEXCOORD_SIZE, MD2_TRIANGLE_SIZE, MD2_VERSION,
};
use crate::md2_types::{Md2Frame, Md2ParseContext, Md2SectionHandler};
use crate::shared::{CANONICAL_LAYOUT, reverse_triangle_winding};
use flight_entity::{Float32Array, Ref, Uint8Array};
use flight_geometry::contract::create_transform3d;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_meshgeometry::{
    IndexBuffer, IndexBufferU32, MeshGeometryOptions, MeshMorph, MeshMorphTarget,
    create_mesh_geometry,
};
use flight_scene3d::{
    MESH_KIND, Scene3DDocument, Scene3DDocumentMesh, Scene3DDocumentNode, Scene3DDocumentScene,
};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

fn build_md2_morph(frames: &[Md2Frame], source_vertex_indices: &[usize]) -> Option<Ref<MeshMorph>> {
    if frames.len() < 2 {
        return None;
    }
    let base = &frames[0];
    let mut targets = Vec::new();
    for frame in &frames[1..] {
        let mut position_deltas = vec![0.0; source_vertex_indices.len() * 3].into_boxed_slice();
        let mut normal_deltas = vec![0.0; source_vertex_indices.len() * 3].into_boxed_slice();
        for (v, source_vertex) in source_vertex_indices.iter().enumerate() {
            for c in 0..3 {
                let src = source_vertex * 3 + c;
                position_deltas[v * 3 + c] = frame.positions[src] - base.positions[src];
                normal_deltas[v * 3 + c] = frame.normals[src] - base.normals[src];
            }
        }
        targets.push(MeshMorphTarget {
            position_deltas,
            normal_deltas: Some(normal_deltas),
            tangent_deltas: None,
        });
    }
    return Some(Arc::new(RwLock::new(MeshMorph {
        weights: vec![0.0; targets.len()].into_boxed_slice(),
        targets: Arc::new(targets),
    })));
}

fn empty_md2_document() -> Scene3DDocument {
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

pub(crate) fn md2_numeric_detail(
    fields: &[(&str, f32)],
) -> Option<HashMap<String, ImportDiagnosticDetailValue>> {
    return Some(
        fields
            .iter()
            .map(|(key, value)| {
                (
                    (*key).to_string(),
                    ImportDiagnosticDetailValue::Number(*value),
                )
            })
            .collect(),
    );
}

pub fn parse_md2_with_section_handlers(
    bytes: &Uint8Array,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    section_handlers: &[Ref<Md2SectionHandler>],
) -> Scene3DDocument {
    use ImportDiagnosticSeverity::{Drop, Recover, Reject};
    if bytes.len() < MD2_HEADER_SIZE {
        report_import_diagnostic(
            diagnostics,
            Reject,
            "md2.header-too-short",
            "parseMd2",
            md2_numeric_detail(&[("byteLength", bytes.len() as f32)]),
        );
        return empty_md2_document();
    }
    let magic = read_md2_i32(bytes, 0);
    if magic != MD2_MAGIC {
        report_import_diagnostic(
            diagnostics,
            Reject,
            "md2.bad-magic",
            "parseMd2",
            Some(HashMap::from([(
                "magic".to_string(),
                ImportDiagnosticDetailValue::String(format!("{:x}", magic as u32)),
            )])),
        );
        return empty_md2_document();
    }
    let version = read_md2_i32(bytes, 4);
    if version != MD2_VERSION {
        report_import_diagnostic(
            diagnostics,
            Reject,
            "md2.unsupported-version",
            "parseMd2",
            md2_numeric_detail(&[("version", version as f32)]),
        );
        return empty_md2_document();
    }
    let skin_width = read_md2_i32(bytes, 8);
    let skin_height = read_md2_i32(bytes, 12);
    let declared_frame_size = read_md2_i32(bytes, 16);
    let num_skins = read_md2_i32(bytes, 20);
    let num_vertices = read_md2_i32(bytes, 24);
    let num_tex_coords = read_md2_i32(bytes, 28);
    let num_triangles = read_md2_i32(bytes, 32);
    let num_frames = read_md2_i32(bytes, 40);
    let off_skins = read_md2_i32(bytes, 44);
    let off_tex_coords = read_md2_i32(bytes, 48);
    let off_triangles = read_md2_i32(bytes, 52);
    let off_frames = read_md2_i32(bytes, 56);
    let declared_end = read_md2_i32(bytes, 64);
    if num_frames < 1 {
        report_import_diagnostic(diagnostics, Reject, "md2.no-frames", "parseMd2", None);
        return empty_md2_document();
    }
    if num_triangles < 1 {
        report_import_diagnostic(diagnostics, Reject, "md2.no-triangles", "parseMd2", None);
        return empty_md2_document();
    }
    if [
        num_vertices,
        num_tex_coords,
        num_skins,
        off_skins,
        off_tex_coords,
        off_triangles,
        off_frames,
    ]
    .iter()
    .any(|value| *value < 0)
    {
        report_import_diagnostic(
            diagnostics,
            Reject,
            "md2.negative-header-field",
            "parseMd2",
            md2_numeric_detail(&[("byteLength", bytes.len() as f32)]),
        );
        return empty_md2_document();
    }
    let num_skins = num_skins as usize;
    let num_vertices = num_vertices as usize;
    let num_tex_coords = num_tex_coords as usize;
    let num_triangles = num_triangles as usize;
    let num_frames = num_frames as usize;
    let off_skins = off_skins as usize;
    let off_tex_coords = off_tex_coords as usize;
    let off_triangles = off_triangles as usize;
    let off_frames = off_frames as usize;
    let frame_stride = MD2_FRAME_HEADER_SIZE + num_vertices * MD2_COMPRESSED_VERTEX_SIZE;
    if declared_frame_size > 0 && declared_frame_size as usize != frame_stride {
        report_import_diagnostic(
            diagnostics,
            Reject,
            "md2.frame-size-mismatch",
            "parseMd2",
            md2_numeric_detail(&[
                ("actual", frame_stride as f32),
                ("expected", declared_frame_size as f32),
            ]),
        );
        return empty_md2_document();
    }
    // Wide extent arithmetic rejects hostile int32 counts before allocating or narrowing an offset.
    let skins_end = off_skins as u128 + num_skins as u128 * MD2_SKIN_SIZE as u128;
    let tex_coords_end =
        off_tex_coords as u128 + num_tex_coords as u128 * MD2_TEXCOORD_SIZE as u128;
    let triangles_end = off_triangles as u128 + num_triangles as u128 * MD2_TRIANGLE_SIZE as u128;
    let all_frames_end = off_frames as u128 + num_frames as u128 * frame_stride as u128;
    if [tex_coords_end, triangles_end, all_frames_end]
        .iter()
        .any(|end| *end > bytes.len() as u128)
    {
        report_import_diagnostic(
            diagnostics,
            Reject,
            "md2.truncated-data-region",
            "parseMd2",
            md2_numeric_detail(&[("byteLength", bytes.len() as f32)]),
        );
        return empty_md2_document();
    }
    if declared_end > 0 && declared_end as usize != bytes.len() {
        report_import_diagnostic(
            diagnostics.as_deref_mut(),
            Recover,
            "md2.file-size-mismatch",
            "parseMd2",
            md2_numeric_detail(&[
                ("actual", bytes.len() as f32),
                ("expected", declared_end as f32),
            ]),
        );
    }
    report_md2_section_overlap(
        diagnostics.as_deref_mut(),
        &[
            (off_skins as u128, skins_end),
            (off_tex_coords as u128, tex_coords_end),
            (off_triangles as u128, triangles_end),
            (off_frames as u128, all_frames_end),
        ],
    );
    let (tex_s, tex_t) = read_md2_tex_coords(
        bytes,
        off_tex_coords,
        num_tex_coords,
        skin_width,
        skin_height,
    );
    let frames = read_md2_frames(
        bytes,
        off_frames,
        num_frames,
        num_vertices,
        frame_stride,
        diagnostics.as_deref_mut(),
    );
    let base = &frames[0];
    // Lookup only: insertion order is retained independently in the output arrays.
    let mut dedup = HashMap::new();
    let mut vertices = Vec::new();
    let mut source_vertex_indices = Vec::new();
    let mut indices = Vec::new();
    let mut out_of_range_vertex_corners = 0;
    let mut out_of_range_tex_coord_corners = 0;
    for t in 0..num_triangles {
        let tri_base = off_triangles + t * MD2_TRIANGLE_SIZE;
        for c in 0..3 {
            let vert_idx = read_md2_u16(bytes, tri_base + c * 2) as usize;
            let tex_idx = read_md2_u16(bytes, tri_base + 6 + c * 2) as usize;
            if vert_idx >= num_vertices {
                out_of_range_vertex_corners += 1;
                continue;
            }
            if tex_idx >= num_tex_coords {
                out_of_range_tex_coord_corners += 1;
                continue;
            }
            let index = *dedup.entry((vert_idx, tex_idx)).or_insert_with(|| {
                let index = source_vertex_indices.len() as f32;
                let p = vert_idx * 3;
                vertices.extend_from_slice(&base.positions[p..p + 3]);
                vertices.extend_from_slice(&base.normals[p..p + 3]);
                vertices.extend_from_slice(&[0.0; 4]);
                vertices.extend_from_slice(&[tex_s[tex_idx], tex_t[tex_idx]]);
                source_vertex_indices.push(vert_idx);
                return index;
            });
            indices.push(index);
        }
    }
    if out_of_range_vertex_corners > 0 {
        report_import_diagnostic(
            diagnostics.as_deref_mut(),
            Drop,
            "md2.triangle-vertex-index-out-of-range",
            "parseMd2",
            md2_numeric_detail(&[("corners", out_of_range_vertex_corners as f32)]),
        );
    }
    if out_of_range_tex_coord_corners > 0 {
        report_import_diagnostic(
            diagnostics.as_deref_mut(),
            Drop,
            "md2.triangle-texcoord-index-out-of-range",
            "parseMd2",
            md2_numeric_detail(&[("corners", out_of_range_tex_coord_corners as f32)]),
        );
    }
    if indices.is_empty() {
        report_import_diagnostic(
            diagnostics,
            Reject,
            "md2.no-valid-triangles",
            "parseMd2",
            None,
        );
        return empty_md2_document();
    }
    let mut document = empty_md2_document();
    let mut mesh_materials = Vec::new();
    reverse_triangle_winding(&mut indices);
    let geometry = Arc::new(RwLock::new(create_mesh_geometry(MeshGeometryOptions {
        vertices: vertices.into_boxed_slice(),
        layout: CANONICAL_LAYOUT.clone(),
        indices: Some(IndexBuffer::U32(IndexBufferU32 {
            data: Arc::new(RwLock::new(
                indices
                    .into_iter()
                    .map(|index| index as u32)
                    .collect::<Vec<_>>()
                    .into_boxed_slice(),
            )),
        })),
        subsets: None,
        topology: None,
    })));
    let morph = build_md2_morph(&frames, &source_vertex_indices);
    {
        let mut context = Md2ParseContext {
            bytes,
            diagnostics,
            document: &mut document,
            frames: &frames,
            mesh_materials: &mut mesh_materials,
            morph: morph.clone(),
            num_skins,
            off_skins,
        };
        for handler in section_handlers {
            let collect = handler.read().unwrap().collect.clone();
            collect(&mut context);
        }
    }
    document.meshes.push(Scene3DDocumentMesh {
        geometry,
        materials: mesh_materials,
        morph,
        name: None,
        skin: None,
    });
    document.nodes.push(Scene3DDocumentNode {
        children: Vec::new(),
        kind: MESH_KIND.to_string(),
        mesh: Some(0),
        name: None,
        transform: create_transform3d(),
    });
    document.scenes[0].root_nodes.push(0);
    return document;
}

fn read_md2_f32(bytes: &Uint8Array, offset: usize) -> f32 {
    return f32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap());
}

// flight-lint: allow(f64) MD2 decoded binary32 scale/translate must widen losslessly before byte*scale+translate, with only final Float32Array rounding (Foreman47334f95)
fn read_md2_frames(
    bytes: &Uint8Array,
    off_frames: usize,
    num_frames: usize,
    num_vertices: usize,
    frame_stride: usize,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Vec<Md2Frame> {
    let mut frames = Vec::new();
    let mut out_of_range_normals = diagnostics.as_ref().map(|_| Vec::new());
    for f in 0..num_frames {
        let frame_base = off_frames + f * frame_stride;
        let scale =
            std::array::from_fn::<_, 3, _>(|c| read_md2_f32(bytes, frame_base + c * 4) as f64);
        let translate =
            std::array::from_fn::<_, 3, _>(|c| read_md2_f32(bytes, frame_base + 12 + c * 4) as f64);
        let name = read_md2_name(bytes, frame_base + 24, MD2_FRAME_NAME_SIZE);
        let mut positions = vec![0.0; num_vertices * 3].into_boxed_slice();
        let mut normals = vec![0.0; num_vertices * 3].into_boxed_slice();
        for i in 0..num_vertices {
            let b = frame_base + MD2_FRAME_HEADER_SIZE + i * MD2_COMPRESSED_VERTEX_SIZE;
            let px = bytes[b] as f64 * scale[0] + translate[0];
            let py = bytes[b + 1] as f64 * scale[1] + translate[1];
            let pz = bytes[b + 2] as f64 * scale[2] + translate[2];
            let p = i * 3;
            positions[p] = px as f32;
            positions[p + 1] = pz as f32;
            positions[p + 2] = -py as f32;
            let ni = bytes[b + 3] as usize;
            if ni < MD2_ANORMS.len() {
                let n = MD2_ANORMS[ni];
                normals[p] = n[0];
                normals[p + 1] = n[2];
                normals[p + 2] = -n[1];
            } else if let Some(indices) = &mut out_of_range_normals {
                if !indices.contains(&ni) {
                    indices.push(ni);
                }
            }
        }
        frames.push(Md2Frame {
            name,
            normals,
            positions,
        });
    }
    if let Some(indices) = out_of_range_normals {
        if let Some(first_index) = indices.iter().min() {
            report_import_diagnostic(
                diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Recover,
                "md2.normal-index-out-of-range",
                "readMd2Frames",
                md2_numeric_detail(&[
                    ("distinctIndices", indices.len() as f32),
                    ("firstIndex", *first_index as f32),
                ]),
            );
        }
    }
    return frames;
}

fn read_md2_i32(bytes: &Uint8Array, offset: usize) -> i32 {
    return i32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap());
}

pub(crate) fn read_md2_name(bytes: &Uint8Array, offset: usize, size: usize) -> String {
    return bytes[offset..offset + size]
        .iter()
        .take_while(|byte| **byte != 0)
        .map(|byte| char::from(*byte))
        .collect();
}

// flight-lint: allow(f64) MD2 source computes reciprocal then int16 multiplication in JS Number precision before Float32Array writes, without intermediate f32 rounding (Foreman47334f95)
fn read_md2_tex_coords(
    bytes: &Uint8Array,
    offset: usize,
    count: usize,
    width: i32,
    height: i32,
) -> (Box<Float32Array>, Box<Float32Array>) {
    let scale_s = if width > 0 { 1.0 / width as f64 } else { 0.0 };
    let scale_t = if height > 0 { 1.0 / height as f64 } else { 0.0 };
    let mut tex_s = vec![0.0; count].into_boxed_slice();
    let mut tex_t = vec![0.0; count].into_boxed_slice();
    for i in 0..count {
        let base = offset + i * MD2_TEXCOORD_SIZE;
        tex_s[i] =
            (i16::from_le_bytes(bytes[base..base + 2].try_into().unwrap()) as f64 * scale_s) as f32;
        tex_t[i] = (i16::from_le_bytes(bytes[base + 2..base + 4].try_into().unwrap()) as f64
            * scale_t) as f32;
    }
    return (tex_s, tex_t);
}

fn read_md2_u16(bytes: &Uint8Array, offset: usize) -> u16 {
    return u16::from_le_bytes(bytes[offset..offset + 2].try_into().unwrap());
}

fn report_md2_section_overlap(
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    sections: &[(u128, u128)],
) {
    for (i, first) in sections.iter().enumerate() {
        if first.1 <= first.0 {
            continue;
        }
        for (j, second) in sections.iter().enumerate().skip(i + 1) {
            if second.1 <= second.0 {
                continue;
            }
            if first.0 < second.1 && second.0 < first.1 {
                report_import_diagnostic(
                    diagnostics.as_deref_mut(),
                    ImportDiagnosticSeverity::Recover,
                    "md2.section-overlap",
                    "parseMd2",
                    md2_numeric_detail(&[("first", i as f32), ("second", j as f32)]),
                );
                return;
            }
        }
    }
}
