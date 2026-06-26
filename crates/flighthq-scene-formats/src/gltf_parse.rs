//! glTF 2.0 document parser — converts a glTF JSON string into a scene node
//! graph with mesh geometry.
//!
//! Ports `@flighthq/scene-formats` `gltfParse.ts`.
//!
//! # Proving slice
//!
//! POSITION + optional NORMAL / TEXCOORD_0 + indices, interleaved into the
//! canonical PBR vertex layout (tangents zero-filled). Not yet imported:
//! materials/textures, animations/skins, sparse accessors, GLB-binary (.glb),
//! multi-primitive meshes beyond the first, and interleaved (`byteStride`)
//! attribute buffer views.

use std::collections::HashMap;

use flighthq_mesh::{MeshGeometryOptions, create_mesh_geometry};
use flighthq_node::{HierarchyArena, HierarchyNode, NodeArena, NodeId, add_node_child};
use flighthq_scene::{SceneArena, create_scene_node};
use flighthq_types::{
    MeshGeometry, MeshIndices, VertexAttribute, VertexAttributeLayout, VertexFormat, VertexSemantic,
};

use crate::gltf_schema::{GltfBuffer, GltfDocument, GltfNode, GltfPrimitive};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Result of parsing a glTF 2.0 document: a scene root node, two arenas
/// (world data and hierarchy links), and mesh geometries keyed by the `NodeId`
/// of the scene node that references them.
pub struct ParsedGltf {
    /// The root "scene" node. Its direct children are the top-level glTF scene
    /// nodes as selected by `doc.scene` (or all root-less nodes as fallback).
    pub scene_root: NodeId,
    /// World nodes: per-node 4×4 local transform and optional name.
    pub world_arena: SceneArena,
    /// Parent/child relationships between all nodes.
    pub hierarchy_arena: HierarchyArena,
    /// Mesh geometries keyed by `NodeId` for nodes that reference a glTF mesh.
    /// Absent for pure transform nodes.
    pub node_geometries: HashMap<NodeId, MeshGeometry>,
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Parses a glTF 2.0 JSON string into a [`ParsedGltf`] scene graph.
///
/// Only embedded (base64 data-URI) buffers are supported. Returns a string
/// error on malformed JSON or unsupported glTF features.
pub fn parse_gltf_document(json: &str) -> Result<ParsedGltf, String> {
    let doc: GltfDocument = serde_json::from_str(json).map_err(|e| e.to_string())?;
    parse_gltf_doc(&doc)
}

// ---------------------------------------------------------------------------
// Internal — document → scene graph
// ---------------------------------------------------------------------------

fn parse_gltf_doc(doc: &GltfDocument) -> Result<ParsedGltf, String> {
    // Decode all buffers from embedded data URIs upfront.
    let buffers: Vec<Vec<u8>> = doc
        .buffers
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .map(decode_gltf_buffer)
        .collect::<Result<_, _>>()?;

    // Build one MeshGeometry per glTF mesh (first primitive only).
    let mesh_geometries: Vec<MeshGeometry> = doc
        .meshes
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .map(|m| primitive_to_geometry(doc, &buffers, &m.primitives[0]))
        .collect::<Result<_, _>>()?;

    let mut world_arena: SceneArena = NodeArena::new();
    let mut hierarchy_arena: HierarchyArena = NodeArena::new();

    // Create the scene root first so its NodeId precedes all glTF node IDs in
    // both arenas — add_node_child requires all IDs to be present.
    let scene_root = create_scene_node(&mut world_arena, None);
    let scene_root_h = hierarchy_arena.insert(HierarchyNode::default());
    debug_assert_eq!(scene_root, scene_root_h, "arena key alignment required");

    let gltf_nodes = doc.nodes.as_deref().unwrap_or(&[]);

    // Allocate one paired entry per glTF node — same insert order keeps the
    // NodeIds aligned across both arenas.
    let scene_node_ids: Vec<NodeId> = gltf_nodes
        .iter()
        .map(|node| {
            let w_id = create_scene_node(&mut world_arena, node.name.clone());
            let h_id = hierarchy_arena.insert(HierarchyNode {
                name: node.name.clone(),
                ..HierarchyNode::default()
            });
            debug_assert_eq!(w_id, h_id, "arena key alignment required");
            w_id
        })
        .collect();

    let mut node_geometries: HashMap<NodeId, MeshGeometry> = HashMap::new();

    // Apply transforms, collect geometry references, and wire up children.
    for (i, gltf_node) in gltf_nodes.iter().enumerate() {
        let node_id = scene_node_ids[i];
        apply_node_transform(&mut world_arena, node_id, gltf_node);

        if let Some(mesh_idx) = gltf_node.mesh {
            if let Some(geom) = mesh_geometries.get(mesh_idx) {
                node_geometries.insert(node_id, geom.clone());
            }
        }

        if let Some(children) = &gltf_node.children {
            for &child_idx in children {
                if let Some(&child_id) = scene_node_ids.get(child_idx) {
                    add_node_child(&mut hierarchy_arena, node_id, child_id);
                }
            }
        }
    }

    // Attach the top-level nodes (from the active scene or by topology) to the
    // scene root.
    let root_indices = get_root_node_indices(doc, gltf_nodes);
    for root_idx in root_indices {
        if let Some(&root_id) = scene_node_ids.get(root_idx) {
            add_node_child(&mut hierarchy_arena, scene_root, root_id);
        }
    }

    Ok(ParsedGltf {
        scene_root,
        world_arena,
        hierarchy_arena,
        node_geometries,
    })
}

// ---------------------------------------------------------------------------
// Internal — transform
// ---------------------------------------------------------------------------

/// Writes the glTF node's transform into `arena[node_id].local_matrix`.
///
/// Prefers the explicit `matrix` field; falls back to composing TRS. When all
/// three TRS components are absent the local matrix stays at identity.
fn apply_node_transform(arena: &mut SceneArena, node_id: NodeId, gltf_node: &GltfNode) {
    if let Some(matrix) = &gltf_node.matrix {
        arena[node_id].local_matrix.m.copy_from_slice(matrix);
        return;
    }

    let t = gltf_node.translation.as_ref();
    let r = gltf_node.rotation.as_ref();
    let s = gltf_node.scale.as_ref();

    if t.is_none() && r.is_none() && s.is_none() {
        return; // identity stays
    }

    let tx = t.map_or(0.0, |v| v[0]);
    let ty = t.map_or(0.0, |v| v[1]);
    let tz = t.map_or(0.0, |v| v[2]);
    // glTF rotation is [qx, qy, qz, qw].
    let qx = r.map_or(0.0, |v| v[0]);
    let qy = r.map_or(0.0, |v| v[1]);
    let qz = r.map_or(0.0, |v| v[2]);
    let qw = r.map_or(1.0, |v| v[3]);
    let sx = s.map_or(1.0, |v| v[0]);
    let sy = s.map_or(1.0, |v| v[1]);
    let sz = s.map_or(1.0, |v| v[2]);

    // Expand quaternion into the pre-computed products used in the rotation
    // matrix formula.
    let x2 = qx + qx;
    let y2 = qy + qy;
    let z2 = qz + qz;
    let xx = qx * x2;
    let xy = qx * y2;
    let xz = qx * z2;
    let yy = qy * y2;
    let yz = qy * z2;
    let zz = qz * z2;
    let wx = qw * x2;
    let wy = qw * y2;
    let wz = qw * z2;

    // Write column-major TRS matrix: T * R * S.  Each column of the rotation
    // matrix is scaled by the corresponding component of S; translation goes
    // in the last column.
    let m = &mut arena[node_id].local_matrix.m;
    m[0] = (1.0 - (yy + zz)) * sx;
    m[1] = (xy + wz) * sx;
    m[2] = (xz - wy) * sx;
    m[3] = 0.0;
    m[4] = (xy - wz) * sy;
    m[5] = (1.0 - (xx + zz)) * sy;
    m[6] = (yz + wx) * sy;
    m[7] = 0.0;
    m[8] = (xz + wy) * sz;
    m[9] = (yz - wx) * sz;
    m[10] = (1.0 - (xx + yy)) * sz;
    m[11] = 0.0;
    m[12] = tx;
    m[13] = ty;
    m[14] = tz;
    m[15] = 1.0;
}

// ---------------------------------------------------------------------------
// Internal — geometry
// ---------------------------------------------------------------------------

/// Converts a glTF primitive into a [`MeshGeometry`] using the canonical PBR
/// interleaved vertex layout (position + normal + tangent + uv0, 48 bytes).
///
/// Tangent is zero-filled (not yet read from glTF). The index buffer is
/// promoted to `u32` regardless of source type to match
/// `create_mesh_geometry`'s auto-promote contract.
fn primitive_to_geometry(
    doc: &GltfDocument,
    buffers: &[Vec<u8>],
    primitive: &GltfPrimitive,
) -> Result<MeshGeometry, String> {
    let pos_idx = primitive
        .attributes
        .position
        .ok_or("glTF primitive missing POSITION attribute")?;
    let position = read_accessor_f32(doc, buffers, pos_idx)?;
    let vertex_count = position.count;

    let normal = primitive
        .attributes
        .normal
        .map(|idx| read_accessor_f32(doc, buffers, idx))
        .transpose()?;
    let uv = primitive
        .attributes
        .texcoord_0
        .map(|idx| read_accessor_f32(doc, buffers, idx))
        .transpose()?;

    // Canonical layout: position(3) + normal(3) + tangent(4) + uv0(2) = 12 f32.
    let mut vertices = vec![0.0f32; vertex_count * CANONICAL_FLOATS_PER_VERTEX];
    for v in 0..vertex_count {
        let o = v * CANONICAL_FLOATS_PER_VERTEX;
        vertices[o] = position.data[v * 3];
        vertices[o + 1] = position.data[v * 3 + 1];
        vertices[o + 2] = position.data[v * 3 + 2];
        if let Some(ref n) = normal {
            vertices[o + 3] = n.data[v * 3];
            vertices[o + 4] = n.data[v * 3 + 1];
            vertices[o + 5] = n.data[v * 3 + 2];
        }
        // tangent (o+6 to o+9) stays zero-filled
        if let Some(ref u) = uv {
            vertices[o + 10] = u.data[v * 2];
            vertices[o + 11] = u.data[v * 2 + 1];
        }
    }

    // glTF index accessors may be ubyte/ushort/uint; normalize to u32.
    let indices = primitive
        .indices
        .map(|idx| read_accessor_u32(doc, buffers, idx))
        .transpose()?
        .map(|r| MeshIndices::U32(r.data));

    Ok(create_mesh_geometry(MeshGeometryOptions {
        indices,
        layout: canonical_vertex_layout(),
        subsets: None,
        topology: None,
        vertices,
    }))
}

// ---------------------------------------------------------------------------
// Internal — accessor reading
// ---------------------------------------------------------------------------

/// Flat float component array decoded from a buffer view.
struct FloatAccessorData {
    /// Element count (e.g. number of vertices for a VEC3 accessor).
    count: usize,
    /// Flat component values: `count * components_per_type` elements.
    data: Vec<f32>,
}

/// Flat u32 component array decoded from a buffer view.
struct U32AccessorData {
    /// Flat component values (promoted to u32 from any integer type).
    data: Vec<u32>,
}

/// Reads a float accessor (componentType FLOAT only) into a flat `Vec<f32>`.
/// Assumes tightly-packed buffer views (no de-striding).
fn read_accessor_f32(
    doc: &GltfDocument,
    buffers: &[Vec<u8>],
    accessor_idx: usize,
) -> Result<FloatAccessorData, String> {
    let (buf, byte_offset, total_components, count) = resolve_accessor(doc, buffers, accessor_idx)?;

    let accessor = &doc.accessors.as_ref().unwrap()[accessor_idx];
    match accessor.component_type {
        5126 => {
            // FLOAT — read 4-byte LE floats.
            let data: Vec<f32> = (0..total_components)
                .map(|i| {
                    let s = byte_offset + i * 4;
                    f32::from_le_bytes([buf[s], buf[s + 1], buf[s + 2], buf[s + 3]])
                })
                .collect();
            Ok(FloatAccessorData { count, data })
        }
        ct => Err(format!(
            "unsupported componentType {ct} for float accessor {accessor_idx}"
        )),
    }
}

/// Reads an integer accessor (UNSIGNED_BYTE / UNSIGNED_SHORT / UNSIGNED_INT)
/// into a flat `Vec<u32>`.  Used for index buffers.
fn read_accessor_u32(
    doc: &GltfDocument,
    buffers: &[Vec<u8>],
    accessor_idx: usize,
) -> Result<U32AccessorData, String> {
    let (buf, byte_offset, total_components, _count) =
        resolve_accessor(doc, buffers, accessor_idx)?;

    let accessor = &doc.accessors.as_ref().unwrap()[accessor_idx];
    let data: Vec<u32> = match accessor.component_type {
        5121 => {
            // UNSIGNED_BYTE
            (0..total_components)
                .map(|i| buf[byte_offset + i] as u32)
                .collect()
        }
        5123 => {
            // UNSIGNED_SHORT
            (0..total_components)
                .map(|i| {
                    let s = byte_offset + i * 2;
                    u16::from_le_bytes([buf[s], buf[s + 1]]) as u32
                })
                .collect()
        }
        5125 => {
            // UNSIGNED_INT
            (0..total_components)
                .map(|i| {
                    let s = byte_offset + i * 4;
                    u32::from_le_bytes([buf[s], buf[s + 1], buf[s + 2], buf[s + 3]])
                })
                .collect()
        }
        ct => {
            return Err(format!(
                "unsupported componentType {ct} for index accessor {accessor_idx}"
            ));
        }
    };

    Ok(U32AccessorData { data })
}

/// Shared setup for accessor reading: resolves the buffer slice, returns
/// `(buf, byte_offset, total_component_count, element_count)`.
fn resolve_accessor<'a>(
    doc: &'a GltfDocument,
    buffers: &'a [Vec<u8>],
    accessor_idx: usize,
) -> Result<(&'a Vec<u8>, usize, usize, usize), String> {
    let accessors = doc
        .accessors
        .as_ref()
        .ok_or("glTF document has no accessors")?;
    let accessor = accessors
        .get(accessor_idx)
        .ok_or_else(|| format!("accessor {accessor_idx} out of range"))?;

    let bv_idx = accessor
        .buffer_view
        .ok_or_else(|| format!("accessor {accessor_idx} has no bufferView"))?;
    let views = doc
        .buffer_views
        .as_ref()
        .ok_or("glTF document has no bufferViews")?;
    let view = views
        .get(bv_idx)
        .ok_or_else(|| format!("bufferView {bv_idx} out of range"))?;

    let buf = buffers
        .get(view.buffer)
        .ok_or_else(|| format!("buffer {} out of range", view.buffer))?;

    let component_count = type_component_count(&accessor.accessor_type)?;
    let byte_offset = (view.byte_offset.unwrap_or(0) + accessor.byte_offset.unwrap_or(0)) as usize;
    let total_components = accessor.count * component_count;

    Ok((buf, byte_offset, total_components, accessor.count))
}

/// Returns the number of scalar components per element for a glTF accessor
/// type string (e.g. `"VEC3"` → 3).
fn type_component_count(accessor_type: &str) -> Result<usize, String> {
    match accessor_type {
        "SCALAR" => Ok(1),
        "VEC2" => Ok(2),
        "VEC3" => Ok(3),
        "VEC4" => Ok(4),
        "MAT2" => Ok(4),
        "MAT3" => Ok(9),
        "MAT4" => Ok(16),
        t => Err(format!("unknown glTF accessor type: {t}")),
    }
}

// ---------------------------------------------------------------------------
// Internal — buffer decoding
// ---------------------------------------------------------------------------

/// Decodes an embedded base64 data-URI buffer into raw bytes.
///
/// Only embedded URIs (`data:…,<base64>`) are supported today. External `.bin`
/// URIs require a loader/fetch seam added later.
fn decode_gltf_buffer(buffer: &GltfBuffer) -> Result<Vec<u8>, String> {
    let uri = buffer.uri.as_deref().unwrap_or("");
    let base64_data = if uri.starts_with("data:") {
        let comma = uri
            .find(',')
            .ok_or("glTF buffer has a data URI without a comma")?;
        &uri[comma + 1..]
    } else {
        uri
    };
    decode_base64(base64_data)
}

/// Minimal RFC 4648 base64 decoder. Handles standard and URL-safe alphabets,
/// ignores whitespace, and treats `=` padding as zero bits (standard practice).
fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    let chars: Vec<u8> = input
        .bytes()
        .filter(|b| !matches!(b, b'\n' | b'\r' | b' ' | b'\t'))
        .collect();

    let mut output = Vec::with_capacity(chars.len() * 3 / 4);
    let mut i = 0;
    while i + 1 < chars.len() {
        let a = b64_char_value(chars[i])?;
        let b = b64_char_value(chars[i + 1])?;
        output.push((a << 2) | (b >> 4));
        if i + 2 < chars.len() && chars[i + 2] != b'=' {
            let c = b64_char_value(chars[i + 2])?;
            output.push((b << 4) | (c >> 2));
            if i + 3 < chars.len() && chars[i + 3] != b'=' {
                let d = b64_char_value(chars[i + 3])?;
                output.push((c << 6) | d);
            }
        }
        i += 4;
    }
    Ok(output)
}

fn b64_char_value(b: u8) -> Result<u8, String> {
    match b {
        b'A'..=b'Z' => Ok(b - b'A'),
        b'a'..=b'z' => Ok(b - b'a' + 26),
        b'0'..=b'9' => Ok(b - b'0' + 52),
        b'+' | b'-' => Ok(62),
        b'/' | b'_' => Ok(63),
        b'=' => Ok(0),
        _ => Err(format!("invalid base64 character: {:#x}", b)),
    }
}

// ---------------------------------------------------------------------------
// Internal — scene root selection
// ---------------------------------------------------------------------------

/// Returns the glTF node indices that belong at the top level of the scene
/// graph. Prefers the active scene's `nodes` array; falls back to all nodes
/// that are not referenced as a child of any other node.
fn get_root_node_indices(doc: &GltfDocument, nodes: &[GltfNode]) -> Vec<usize> {
    if let Some(scenes) = &doc.scenes {
        let scene_idx = doc.scene.unwrap_or(0);
        if let Some(scene) = scenes.get(scene_idx) {
            if let Some(roots) = &scene.nodes {
                return roots.clone();
            }
        }
    }
    top_level_node_indices(nodes)
}

/// Returns node indices that are not referenced as a child of any other node.
fn top_level_node_indices(nodes: &[GltfNode]) -> Vec<usize> {
    let mut referenced = HashMap::new();
    for node in nodes {
        if let Some(children) = &node.children {
            for &c in children {
                referenced.insert(c, true);
            }
        }
    }
    (0..nodes.len())
        .filter(|i| !referenced.contains_key(i))
        .collect()
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Floats per canonical PBR vertex record: position(3) + normal(3) +
/// tangent(4) + uv0(2) = 12.
const CANONICAL_FLOATS_PER_VERTEX: usize = 12;

/// The canonical interleaved PBR vertex layout shared by the mesh builders
/// and scene-{gl,wgpu} renderers: position(3) + normal(3) + tangent(4, w =
/// handedness sign) + uv0(2), stride 48 bytes / 12 floats.
fn canonical_vertex_layout() -> VertexAttributeLayout {
    VertexAttributeLayout {
        attributes: vec![
            VertexAttribute {
                byte_offset: 0,
                format: VertexFormat::Float32x3,
                semantic: VertexSemantic::Position,
            },
            VertexAttribute {
                byte_offset: 12,
                format: VertexFormat::Float32x3,
                semantic: VertexSemantic::Normal,
            },
            VertexAttribute {
                byte_offset: 24,
                format: VertexFormat::Float32x4,
                semantic: VertexSemantic::Tangent,
            },
            VertexAttribute {
                byte_offset: 40,
                format: VertexFormat::Float32x2,
                semantic: VertexSemantic::Uv0,
            },
        ],
        stride: 48,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use flighthq_mesh::{get_mesh_geometry_index_count, get_mesh_geometry_vertex_count};
    use flighthq_node::get_node_children;

    use super::*;

    /// Base64 encoder used only in tests to construct embedded glTF buffers.
    fn encode_base64(data: &[u8]) -> String {
        const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
        let mut i = 0;
        while i < data.len() {
            let b0 = data[i] as u32;
            let b1 = if i + 1 < data.len() {
                data[i + 1] as u32
            } else {
                0
            };
            let b2 = if i + 2 < data.len() {
                data[i + 2] as u32
            } else {
                0
            };
            out.push(CHARS[((b0 >> 2) & 0x3f) as usize] as char);
            out.push(CHARS[(((b0 << 4) | (b1 >> 4)) & 0x3f) as usize] as char);
            out.push(if i + 1 < data.len() {
                CHARS[(((b1 << 2) | (b2 >> 6)) & 0x3f) as usize] as char
            } else {
                '='
            });
            out.push(if i + 2 < data.len() {
                CHARS[(b2 & 0x3f) as usize] as char
            } else {
                '='
            });
            i += 3;
        }
        out
    }

    /// A single triangle (3 positions) with a u16 index buffer, embedded as a
    /// base64 data URI, on a node translated to (5, 0, 0). Mirrors the TS test
    /// fixture in `gltfParse.test.ts`.
    fn make_triangle_gltf_json() -> String {
        // Positions: 3 vertices × 3 f32 = 9 f32 = 36 bytes.
        let positions: [f32; 9] = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0];
        // Indices: 3 × u16 = 6 bytes.
        let indices: [u16; 3] = [0, 1, 2];

        let pos_bytes: Vec<u8> = positions.iter().flat_map(|f| f.to_le_bytes()).collect();
        let idx_bytes: Vec<u8> = indices.iter().flat_map(|i| i.to_le_bytes()).collect();
        let mut all_bytes = pos_bytes.clone();
        all_bytes.extend_from_slice(&idx_bytes);
        let byte_len = all_bytes.len();
        let pos_len = pos_bytes.len();

        let uri = format!(
            "data:application/octet-stream;base64,{}",
            encode_base64(&all_bytes)
        );

        format!(
            r#"{{
  "asset": {{"version":"2.0"}},
  "scene": 0,
  "scenes": [{{"nodes":[0]}}],
  "nodes": [{{"mesh":0,"translation":[5,0,0]}}],
  "meshes": [{{"primitives":[{{"attributes":{{"POSITION":0}},"indices":1}}]}}],
  "accessors": [
    {{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3"}},
    {{"bufferView":1,"componentType":5123,"count":3,"type":"SCALAR"}}
  ],
  "bufferViews": [
    {{"buffer":0,"byteOffset":0,"byteLength":{pos_len}}},
    {{"buffer":0,"byteOffset":{pos_len},"byteLength":6}}
  ],
  "buffers": [{{"byteLength":{byte_len},"uri":"{uri}"}}]
}}"#
        )
    }

    mod parse_gltf_document {
        use super::*;

        #[test]
        fn builds_the_node_hierarchy_with_the_imported_mesh_and_transform() {
            let json = make_triangle_gltf_json();
            let parsed = parse_gltf_document(&json).expect("parse failed");

            let children = get_node_children(&parsed.hierarchy_arena, parsed.scene_root);
            assert_eq!(children.len(), 1, "scene root should have 1 child");

            let mesh_node_id = children[0];

            // The node must have an associated mesh geometry.
            assert!(
                parsed.node_geometries.contains_key(&mesh_node_id),
                "child node should have a mesh geometry"
            );

            // Translation x should be 5.
            let tx = parsed.world_arena[mesh_node_id].local_matrix.m[12];
            assert!(
                (tx - 5.0).abs() < 1e-5,
                "expected translation x ≈ 5, got {tx}"
            );

            // Geometry counts.
            let geom = &parsed.node_geometries[&mesh_node_id];
            assert_eq!(get_mesh_geometry_vertex_count(geom), 3);
            assert_eq!(get_mesh_geometry_index_count(geom), 3);
        }

        #[test]
        fn scene_root_has_correct_child_count() {
            let json = make_triangle_gltf_json();
            let parsed = parse_gltf_document(&json).expect("parse failed");
            let children = get_node_children(&parsed.hierarchy_arena, parsed.scene_root);
            assert_eq!(children.len(), 1);
        }

        #[test]
        fn identity_transform_node_has_identity_local_matrix() {
            // A node with no transform fields should keep the identity matrix.
            let json = r#"{
  "asset":{"version":"2.0"},
  "scenes":[{"nodes":[0]}],
  "nodes":[{}]
}"#;
            let parsed = parse_gltf_document(json).expect("parse failed");
            let children = get_node_children(&parsed.hierarchy_arena, parsed.scene_root);
            assert_eq!(children.len(), 1);
            let m = &parsed.world_arena[children[0]].local_matrix.m;
            // Identity: diagonal = [1,1,1,1] at indices 0,5,10,15.
            assert_eq!(m[0], 1.0);
            assert_eq!(m[5], 1.0);
            assert_eq!(m[10], 1.0);
            assert_eq!(m[15], 1.0);
            assert_eq!(m[12], 0.0); // no translation
        }

        #[test]
        fn matrix_field_is_copied_directly_to_local_matrix() {
            #[rustfmt::skip]
            let matrix = [
                1.0, 0.0, 0.0, 0.0,
                0.0, 1.0, 0.0, 0.0,
                0.0, 0.0, 1.0, 0.0,
                3.0, 7.0, 0.0, 1.0,
            ];
            let json = format!(
                r#"{{"asset":{{"version":"2.0"}},"scenes":[{{"nodes":[0]}}],"nodes":[{{"matrix":{:?}}}]}}"#,
                matrix
            );
            let parsed = parse_gltf_document(&json).expect("parse failed");
            let children = get_node_children(&parsed.hierarchy_arena, parsed.scene_root);
            let m = &parsed.world_arena[children[0]].local_matrix.m;
            assert_eq!(m[12], 3.0);
            assert_eq!(m[13], 7.0);
        }
    }
}
