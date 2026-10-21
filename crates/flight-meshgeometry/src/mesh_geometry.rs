use flight_entity::{EntityRuntimeSlot, allocate_entity};
use flight_geometry::Aabb;
use flight_geometry::create_aabb;

use crate::VertexAttributeLayout;
use crate::VertexSemantic;

#[cfg(test)]
mod cache_tests {
    use super::*;
    #[test]
    fn preserved_index_buffer_equality_delegates_to_its_compatibility_helper() {
        let a = IndexBuffer::U16(IndexBufferU16 {
            data: std::sync::Arc::new(std::sync::RwLock::new(vec![0u16, 1, 2].into_boxed_slice())),
        });
        let b = IndexBuffer::U16(IndexBufferU16 {
            data: std::sync::Arc::new(std::sync::RwLock::new(vec![0u16, 2, 1].into_boxed_slice())),
        });
        for value in [&a, &b, &IndexBuffer::None] {
            assert_eq!(a == *value, equals_index_buffer(&a, value));
        }
    }

    #[test]
    fn backend_teardown_clears_only_the_named_upload_slot() {
        let mut geometry = crate::create_box_mesh_geometry(Some(1.0), Some(1.0), Some(1.0));
        geometry.geometry_runtime.webgl_data = Some(());
        geometry.geometry_runtime.webgpu_data = Some(());
        destroy_mesh_geometry_gl_data(&mut geometry);
        assert!(geometry.geometry_runtime.webgl_data.is_none());
        assert!(geometry.geometry_runtime.webgpu_data.is_some());
        geometry.geometry_runtime.webgl_data = Some(());
        destroy_mesh_geometry_wgpu_data(&mut geometry);
        assert!(geometry.geometry_runtime.webgl_data.is_some());
        assert!(geometry.geometry_runtime.webgpu_data.is_none());
    }
}

/// The topology of the primitive assembly for the mesh geometry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PrimitiveTopology {
    LineList,
    LineStrip,
    PointList,
    TriangleList,
    TriangleStrip,
}

/// Payload of the 16-bit typed-index alternative; shared fixed-length storage preserves the source buffer identity.
#[derive(Debug, Clone)]
pub struct IndexBufferU16 {
    pub data: flight_entity::Ref<Box<[u16]>>,
}

/// Payload of the 32-bit typed-index alternative; shared fixed-length storage preserves the source buffer identity.
#[derive(Debug, Clone)]
pub struct IndexBufferU32 {
    pub data: flight_entity::Ref<Box<[u32]>>,
}

/// An index buffer that can be either 16-bit or 32-bit, or absent.
#[derive(Debug, Clone)]
pub enum IndexBuffer {
    U16(IndexBufferU16),
    U32(IndexBufferU32),
    None,
}

/// A draw range within the index/element stream, addressing one material binding.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MeshSubset {
    pub index_count: u32,
    pub index_offset: u32,
}

/// The morph blend-pose capture: de-interleaved base position/normal/tangent plus
/// reusable scratch for blended output. Normal and tangent arrays are None when the
/// base layout omits that channel.
#[derive(Debug, Clone)]
pub struct MeshMorphBindPose {
    pub blended_normals: Option<Box<[f32]>>,
    pub blended_positions: Box<[f32]>,
    pub blended_tangents: Option<Box<[f32]>>,
    pub normals: Option<Box<[f32]>>,
    pub positions: Box<[f32]>,
    pub tangents: Option<Box<[f32]>>,
}

/// The skinning bind-pose capture.
#[derive(Debug, Clone)]
pub struct MeshSkinBindPose {
    pub joints: Box<[f32]>,
    pub normals: Box<[f32]>,
    pub positions: Box<[f32]>,
    pub skinned_normals: Box<[f32]>,
    pub skinned_positions: Box<[f32]>,
    pub skinned_tangents: Box<[f32]>,
    pub tangents: Box<[f32]>,
    pub weights: Box<[f32]>,
}

/// A morph target: additive deltas for position (and optionally normal/tangent).
#[derive(Debug, Clone)]
pub struct MeshMorphTarget {
    pub position_deltas: Box<[f32]>,
    pub normal_deltas: Option<Box<[f32]>>,
    pub tangent_deltas: Option<Box<[f32]>>,
}

/// A morph definition: a set of targets and their blend weights.
#[derive(Debug, Clone)]
pub struct MeshMorph {
    pub targets: Vec<MeshMorphTarget>,
    pub weights: Box<[f32]>,
}

/// Runtime data cached on a MeshGeometry for GPU backends and deformation subsystems.
#[derive(Debug, Clone)]
pub struct MeshGeometryRuntime {
    pub bounds_version: i32,
    pub morph_bind_pose: Option<flight_entity::Ref<MeshMorphBindPose>>,
    pub morph_blended_weights: Option<Box<[f32]>>,
    pub skin_bind_pose: Option<flight_entity::Ref<MeshSkinBindPose>>,
    pub webgl_data: Option<()>,
    pub webgpu_data: Option<()>,
}

/// Complete construction fields, mirroring Omit<MeshGeometry, EntityRuntimeKey>.
pub struct MeshGeometryFields {
    pub bounds: Option<Aabb>,
    pub indices: IndexBuffer,
    pub layout: flight_entity::Ref<VertexAttributeLayout>,
    pub subsets: Vec<MeshSubset>,
    pub topology: PrimitiveTopology,
    pub version: u32,
    pub vertices: Box<[f32]>,
}

/// Options for creating a MeshGeometry.
pub struct MeshGeometryOptions {
    pub vertices: Box<[f32]>,
    pub layout: flight_entity::Ref<VertexAttributeLayout>,
    pub indices: Option<IndexBuffer>,
    pub subsets: Option<Vec<MeshSubset>>,
    pub topology: Option<PrimitiveTopology>,
}

/// A mesh with a Mesh node reference, used by updateMeshMorph.
#[derive(Debug, Clone, Default)]
pub struct Mesh {
    runtime: EntityRuntimeSlot,
    pub geometry: MeshGeometry,
    pub morph: Option<MeshMorph>,
}

/// Source input union: readonly number[] | Uint16Array | Uint32Array.
// flight-lint: allow(enum-payload-named) Principal79b3e3a0 approves the source union of arrays as direct array payloads, following the scalar-union mapping
#[derive(Debug, Clone, PartialEq)]
pub enum MeshAttributeIndices {
    Values(Vec<u32>),
    Uint16(Box<[u16]>),
    Uint32(Box<[u32]>),
}

/// Options for building a MeshGeometry from separate attribute arrays.
pub struct MeshGeometryFromAttributesOptions {
    pub positions: Vec<f32>,
    pub normals: Option<Vec<f32>>,
    pub uvs: Option<Vec<f32>>,
    pub indices: Option<MeshAttributeIndices>,
}

/// Triangle vertex indices resolved from the geometry's topology.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MeshTriangleVertexIndices {
    pub i0: u32,
    pub i1: u32,
    pub i2: u32,
}

/// The core mesh geometry data: interleaved vertex stream, optional index buffer,
/// layout, topology, subsets, optional bounds, a version counter, and runtime data.
#[derive(Debug, Clone)]
pub struct MeshGeometry {
    pub vertices: Box<[f32]>,
    pub indices: IndexBuffer,
    pub layout: flight_entity::Ref<VertexAttributeLayout>,
    pub subsets: Vec<MeshSubset>,
    pub topology: PrimitiveTopology,
    pub bounds: Option<Aabb>,
    pub version: u32,
    runtime: EntityRuntimeSlot,
    pub(crate) geometry_runtime: MeshGeometryRuntime,
}

const UINT16_INDEX_CEILING: u32 = 65535;

/// Creates a MeshGeometry from the given options. Indices are promoted to u32 when
/// the vertex count exceeds the u16 ceiling. A default single-subset spanning the
/// whole element stream is added when subsets are not provided.
pub fn create_mesh_geometry(options: MeshGeometryOptions) -> MeshGeometry {
    let vertices = options.vertices;
    let vertex_count = get_vertex_count_from_layout(&vertices, &options.layout.read().unwrap());

    let indices = match options.indices {
        Some(idx) => promote_indices(idx, vertex_count),
        None => IndexBuffer::None,
    };

    let subsets = match options.subsets {
        Some(s) => s,
        None => {
            let count = match &indices {
                IndexBuffer::U16(IndexBufferU16 { data: v }) => {
                    let v = v.read().unwrap();
                    v.len() as u32
                }
                IndexBuffer::U32(IndexBufferU32 { data: v }) => {
                    let v = v.read().unwrap();
                    v.len() as u32
                }
                IndexBuffer::None => vertex_count,
            };
            vec![MeshSubset {
                index_count: count,
                index_offset: 0,
            }]
        }
    };

    let topology = options.topology.unwrap_or(PrimitiveTopology::TriangleList);

    return create_mesh_geometry_runtime(MeshGeometryFields {
        bounds: None,
        indices,
        layout: options.layout,
        subsets,
        topology,
        version: 0,
        vertices: (vertices).into(),
    });
}

fn create_mesh_geometry_runtime(fields: MeshGeometryFields) -> MeshGeometry {
    let bounds_version = if fields.bounds.is_some() {
        fields.version as i32
    } else {
        -1
    };
    let mut out: MeshGeometry = allocate_entity();
    initialize_mesh_geometry(&mut out, fields);
    out.geometry_runtime.bounds_version = bounds_version;
    return out;
}

/// Writes a MeshGeometry into a pre-allocated out parameter.
pub fn initialize_mesh_geometry(out: &mut MeshGeometry, fields: MeshGeometryFields) {
    out.bounds = fields.bounds;
    out.indices = fields.indices;
    out.layout = fields.layout;
    out.subsets = fields.subsets;
    out.topology = fields.topology;
    out.version = fields.version;
    out.vertices = (fields.vertices).into();
}

/// Deep-copies a MeshGeometry: fresh vertex/index data, a cloned bounds (or None), and
/// fresh subsets. The clone carries its own runtime, so GPU upload slots are not shared.
/// Version resets to 0.
pub fn clone_mesh_geometry(source: &MeshGeometry) -> MeshGeometry {
    let vertices = source.vertices.clone();

    let indices = match &source.indices {
        IndexBuffer::U16(IndexBufferU16 { data: v }) => {
            let v = v.read().unwrap();
            IndexBuffer::U16(IndexBufferU16 {
                data: std::sync::Arc::new(std::sync::RwLock::new((v.clone()).into())),
            })
        }
        IndexBuffer::U32(IndexBufferU32 { data: v }) => {
            let v = v.read().unwrap();
            IndexBuffer::U32(IndexBufferU32 {
                data: std::sync::Arc::new(std::sync::RwLock::new((v.clone()).into())),
            })
        }
        IndexBuffer::None => IndexBuffer::None,
    };

    let subsets: Vec<MeshSubset> = source
        .subsets
        .iter()
        .map(|s| MeshSubset {
            index_count: s.index_count,
            index_offset: s.index_offset,
        })
        .collect();

    let bounds = source
        .bounds
        .as_ref()
        .map(|b| create_aabb(b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z));

    return create_mesh_geometry_runtime(MeshGeometryFields {
        vertices: (vertices).into(),
        indices,
        layout: source.layout.clone(),
        subsets,
        topology: source.topology,
        bounds,
        version: 0,
    });
}

/// Copies descriptors (layout, topology, subsets, bounds) without copying the vertex stream.
/// The clone's vertex array is empty. Version resets to 0.
pub fn clone_mesh_geometry_metadata(source: &MeshGeometry) -> MeshGeometry {
    let bounds = source
        .bounds
        .as_ref()
        .map(|b| create_aabb(b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z));

    let subsets: Vec<MeshSubset> = source
        .subsets
        .iter()
        .map(|s| MeshSubset {
            index_count: s.index_count,
            index_offset: s.index_offset,
        })
        .collect();

    return create_mesh_geometry_runtime(MeshGeometryFields {
        vertices: (Vec::new()).into(),
        indices: source.indices.clone(),
        layout: source.layout.clone(),
        subsets,
        topology: source.topology,
        bounds,
        version: 0,
    });
}

/// Releases the GL GPU upload slot on the geometry's runtime back to None.
pub fn destroy_mesh_geometry_gl_data(geometry: &mut MeshGeometry) {
    geometry.geometry_runtime.webgl_data = None;
}

/// Releases the Wgpu GPU upload slot on the geometry's runtime back to None.
pub fn destroy_mesh_geometry_wgpu_data(geometry: &mut MeshGeometry) {
    geometry.geometry_runtime.webgpu_data = None;
}

fn equals_index_buffer(a: &IndexBuffer, b: &IndexBuffer) -> bool {
    return match (a, b) {
        (IndexBuffer::None, IndexBuffer::None) => true,
        (IndexBuffer::U16(a), IndexBuffer::U16(b)) => {
            *a.data.read().unwrap() == *b.data.read().unwrap()
        }
        (IndexBuffer::U32(a), IndexBuffer::U32(b)) => {
            *a.data.read().unwrap() == *b.data.read().unwrap()
        }
        _ => false,
    };
}

/// Returns the number of elements in the index buffer.

/// Returns the index value at the given element position.

/// Returns the number of indices in the geometry's index buffer, or 0 for non-indexed geometry.
pub fn get_mesh_geometry_index_count(geometry: &MeshGeometry) -> u32 {
    return match &geometry.indices {
        IndexBuffer::U16(IndexBufferU16 { data: v }) => {
            let v = v.read().unwrap();
            v.len() as u32
        }
        IndexBuffer::U32(IndexBufferU32 { data: v }) => {
            let v = v.read().unwrap();
            v.len() as u32
        }
        IndexBuffer::None => 0,
    };
}

/// Returns the CPU-morph base pose cached on the geometry's runtime, or None before
/// the first morph capture.
pub fn get_mesh_geometry_morph_bind_pose(
    geometry: &MeshGeometry,
) -> Option<&flight_entity::Ref<MeshMorphBindPose>> {
    return geometry.geometry_runtime.morph_bind_pose.as_ref();
}

/// Returns the CPU-skinning bind pose cached on the geometry's runtime, or None before
/// the first skin capture.
pub fn get_mesh_geometry_skin_bind_pose(
    geometry: &MeshGeometry,
) -> Option<&flight_entity::Ref<MeshSkinBindPose>> {
    return geometry.geometry_runtime.skin_bind_pose.as_ref();
}

/// Returns the number of vertices, derived from the interleaved vertex stream and the
/// layout stride.
pub fn get_mesh_geometry_vertex_count(geometry: &MeshGeometry) -> u32 {
    return get_vertex_count_from_layout(&geometry.vertices, &geometry.layout.read().unwrap());
}

// flight-lint: allow(conform-extra) D9 exact string table for the source closed PrimitiveTopology union
pub fn get_primitive_topology_string(value: PrimitiveTopology) -> &'static str {
    return match value {
        PrimitiveTopology::LineList => "line-list",
        PrimitiveTopology::LineStrip => "line-strip",
        PrimitiveTopology::PointList => "point-list",
        PrimitiveTopology::TriangleList => "triangle-list",
        PrimitiveTopology::TriangleStrip => "triangle-strip",
    };
}

fn get_vertex_count_from_layout(vertices: &[f32], layout: &VertexAttributeLayout) -> u32 {
    let floats_per_vertex = layout.stride / 4;
    if floats_per_vertex == 0 {
        return 0;
    }
    return (vertices.len() as u32) / floats_per_vertex;
}

/// Returns true when the geometry's vertex layout carries the joints0 skinning channel.
pub fn has_mesh_geometry_skin(geometry: &MeshGeometry) -> bool {
    let attributes = &geometry.layout.read().unwrap().attributes;
    for i in 0..attributes.len() {
        if attributes[i].semantic == VertexSemantic::Joints0 {
            return true;
        }
    }
    return false;
}

/// Marks direct writes to the shared vertex/index payload visible to bounds and every
/// backend upload cache. Wraps as a u32.
pub fn invalidate_mesh_geometry(geometry: &mut MeshGeometry) {
    geometry.version = geometry.version.wrapping_add(1);
}

// flight-lint: allow(conform-extra) D9 exact string table for the source closed PrimitiveTopology union
pub fn parse_primitive_topology(s: &str) -> Option<PrimitiveTopology> {
    return match s {
        "line-list" => Some(PrimitiveTopology::LineList),
        "line-strip" => Some(PrimitiveTopology::LineStrip),
        "point-list" => Some(PrimitiveTopology::PointList),
        "triangle-list" => Some(PrimitiveTopology::TriangleList),
        "triangle-strip" => Some(PrimitiveTopology::TriangleStrip),
        _ => None,
    };
}

fn promote_indices(source: IndexBuffer, vertex_count: u32) -> IndexBuffer {
    if vertex_count > UINT16_INDEX_CEILING {
        if let IndexBuffer::U16(IndexBufferU16 { data: v }) = &source {
            let v = v.read().unwrap();
            {
                let out: Vec<u32> = v.iter().map(|x| *x as u32).collect();
                return IndexBuffer::U32(IndexBufferU32 {
                    data: std::sync::Arc::new(std::sync::RwLock::new(out.into_boxed_slice())),
                });
            }
        }
    }
    return source;
}

/// Stores (or clears) the CPU-morph base pose on the geometry's runtime.
pub fn set_mesh_geometry_morph_bind_pose(
    geometry: &mut MeshGeometry,
    bind_pose: Option<flight_entity::Ref<MeshMorphBindPose>>,
) {
    geometry.geometry_runtime.morph_bind_pose = bind_pose;
}

/// Stores (or clears) the CPU-skinning bind pose on the geometry's runtime.
pub fn set_mesh_geometry_skin_bind_pose(
    geometry: &mut MeshGeometry,
    bind_pose: Option<flight_entity::Ref<MeshSkinBindPose>>,
) {
    geometry.geometry_runtime.skin_bind_pose = bind_pose;
}

flight_entity::impl_entity!(MeshGeometry);
flight_entity::impl_entity!(Mesh);

impl Default for MeshGeometryRuntime {
    fn default() -> Self {
        return MeshGeometryRuntime {
            bounds_version: -1,
            morph_bind_pose: None,
            morph_blended_weights: None,
            skin_bind_pose: None,
            webgl_data: None,
            webgpu_data: None,
        };
    }
}

impl Default for MeshGeometry {
    fn default() -> Self {
        return MeshGeometry {
            vertices: (Vec::new()).into(),
            indices: IndexBuffer::None,
            layout: std::sync::Arc::new(std::sync::RwLock::new(VertexAttributeLayout::default())),
            subsets: Vec::new(),
            topology: PrimitiveTopology::TriangleList,
            bounds: None,
            version: 0,
            runtime: EntityRuntimeSlot::default(),
            geometry_runtime: MeshGeometryRuntime::default(),
        };
    }
}

impl PartialEq for IndexBuffer {
    fn eq(&self, other: &Self) -> bool {
        return equals_index_buffer(self, other);
    }
}
