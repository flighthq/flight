use flight_geometry::Aabb;
use flight_geometry::create_aabb;

use crate::VertexAttributeLayout;
use crate::VertexSemantic;

/// The topology of the primitive assembly for the mesh geometry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PrimitiveTopology {
    LineList,
    LineStrip,
    PointList,
    TriangleList,
    TriangleStrip,
}

/// An index buffer that can be either 16-bit or 32-bit, or absent.
#[derive(Debug, Clone, PartialEq)]
pub enum IndexBuffer {
    U16(Vec<u16>),
    U32(Vec<u32>),
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
    pub blended_normals: Option<Vec<f32>>,
    pub blended_positions: Vec<f32>,
    pub blended_tangents: Option<Vec<f32>>,
    pub normals: Option<Vec<f32>>,
    pub positions: Vec<f32>,
    pub tangents: Option<Vec<f32>>,
}

/// The skinning bind-pose capture.
#[derive(Debug, Clone)]
pub struct MeshSkinBindPose {
    pub joints: Vec<f32>,
    pub normals: Vec<f32>,
    pub positions: Vec<f32>,
    pub skinned_normals: Vec<f32>,
    pub skinned_positions: Vec<f32>,
    pub skinned_tangents: Vec<f32>,
    pub tangents: Vec<f32>,
    pub weights: Vec<f32>,
}

/// A morph target: additive deltas for position (and optionally normal/tangent).
#[derive(Debug, Clone)]
pub struct MeshMorphTarget {
    pub position_deltas: Vec<f32>,
    pub normal_deltas: Option<Vec<f32>>,
    pub tangent_deltas: Option<Vec<f32>>,
}

/// A morph definition: a set of targets and their blend weights.
#[derive(Debug, Clone)]
pub struct MeshMorph {
    pub targets: Vec<MeshMorphTarget>,
    pub weights: Vec<f32>,
}

/// Runtime data cached on a MeshGeometry for GPU backends and deformation subsystems.
#[derive(Debug, Clone)]
pub struct MeshGeometryRuntime {
    pub bounds_version: i32,
    pub morph_bind_pose: Option<MeshMorphBindPose>,
    pub morph_blended_weights: Option<Vec<f32>>,
    pub skin_bind_pose: Option<MeshSkinBindPose>,
    pub webgl_data: Option<()>,
    pub webgpu_data: Option<()>,
}

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

/// Options for creating a MeshGeometry.
pub struct MeshGeometryOptions {
    pub vertices: Vec<f32>,
    pub layout: VertexAttributeLayout,
    pub indices: Option<IndexBuffer>,
    pub subsets: Option<Vec<MeshSubset>>,
    pub topology: Option<PrimitiveTopology>,
}

/// A mesh with a Mesh node reference, used by updateMeshMorph.
#[derive(Debug, Clone)]
pub struct Mesh {
    pub geometry: MeshGeometry,
    pub morph: Option<MeshMorph>,
}

/// Options for building a MeshGeometry from separate attribute arrays.
pub struct MeshGeometryFromAttributesOptions {
    pub positions: Vec<f32>,
    pub normals: Option<Vec<f32>>,
    pub uvs: Option<Vec<f32>>,
    pub indices: Option<Vec<u32>>,
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
    pub vertices: Vec<f32>,
    pub indices: IndexBuffer,
    pub layout: VertexAttributeLayout,
    pub subsets: Vec<MeshSubset>,
    pub topology: PrimitiveTopology,
    pub bounds: Option<Aabb>,
    pub version: u32,
    pub runtime: MeshGeometryRuntime,
}

impl Default for MeshGeometry {
    fn default() -> Self {
        return MeshGeometry {
            vertices: Vec::new(),
            indices: IndexBuffer::None,
            layout: VertexAttributeLayout::default(),
            subsets: Vec::new(),
            topology: PrimitiveTopology::TriangleList,
            bounds: None,
            version: 0,
            runtime: MeshGeometryRuntime::default(),
        };
    }
}

const UINT16_INDEX_CEILING: u32 = 65535;

/// Creates a MeshGeometry from the given options. Indices are promoted to u32 when
/// the vertex count exceeds the u16 ceiling. A default single-subset spanning the
/// whole element stream is added when subsets are not provided.
pub fn create_mesh_geometry(options: MeshGeometryOptions) -> MeshGeometry {
    let mut out = MeshGeometry::default();
    initialize_mesh_geometry(&mut out, options);
    return out;
}

/// Writes a MeshGeometry into a pre-allocated out parameter.
pub fn initialize_mesh_geometry(out: &mut MeshGeometry, options: MeshGeometryOptions) {
    let vertices = options.vertices;
    let vertex_count = get_vertex_count_from_layout(&vertices, &options.layout);

    let indices = match options.indices {
        Some(idx) => promote_indices(idx, vertex_count),
        None => IndexBuffer::None,
    };

    let subsets = match options.subsets {
        Some(s) => s,
        None => {
            let count = match &indices {
                IndexBuffer::U16(v) => v.len() as u32,
                IndexBuffer::U32(v) => v.len() as u32,
                IndexBuffer::None => vertex_count,
            };
            vec![MeshSubset { index_count: count, index_offset: 0 }]
        }
    };

    let topology = options.topology.unwrap_or(PrimitiveTopology::TriangleList);

    out.vertices = vertices;
    out.indices = indices;
    out.layout = options.layout;
    out.subsets = subsets;
    out.topology = topology;
    out.bounds = None;
    out.version = 0;
    out.runtime = MeshGeometryRuntime::default();
}

/// Deep-copies a MeshGeometry: fresh vertex/index data, a cloned bounds (or None), and
/// fresh subsets. The clone carries its own runtime, so GPU upload slots are not shared.
/// Version resets to 0.
pub fn clone_mesh_geometry(source: &MeshGeometry) -> MeshGeometry {
    let vertices = source.vertices.clone();

    let indices = match &source.indices {
        IndexBuffer::U16(v) => IndexBuffer::U16(v.clone()),
        IndexBuffer::U32(v) => IndexBuffer::U32(v.clone()),
        IndexBuffer::None => IndexBuffer::None,
    };

    let subsets: Vec<MeshSubset> = source.subsets.iter().map(|s| {
        MeshSubset { index_count: s.index_count, index_offset: s.index_offset }
    }).collect();

    let bounds = source.bounds.map(|b| {
        create_aabb(b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z)
    });

    return MeshGeometry {
        vertices,
        indices,
        layout: source.layout.clone(),
        subsets,
        topology: source.topology,
        bounds,
        version: 0,
        runtime: MeshGeometryRuntime::default(),
    };
}

/// Copies descriptors (layout, topology, subsets, bounds) without copying the vertex stream.
/// The clone's vertex array is empty. Version resets to 0.
pub fn clone_mesh_geometry_metadata(source: &MeshGeometry) -> MeshGeometry {
    let bounds = source.bounds.map(|b| {
        create_aabb(b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z)
    });

    let subsets: Vec<MeshSubset> = source.subsets.iter().map(|s| {
        MeshSubset { index_count: s.index_count, index_offset: s.index_offset }
    }).collect();

    return MeshGeometry {
        vertices: Vec::new(),
        indices: source.indices.clone(),
        layout: source.layout.clone(),
        subsets,
        topology: source.topology,
        bounds,
        version: 0,
        runtime: MeshGeometryRuntime::default(),
    };
}

/// Releases the GL GPU upload slot on the geometry's runtime back to None.
pub fn destroy_mesh_geometry_gl_data(geometry: &mut MeshGeometry) {
    geometry.runtime.webgl_data = None;
}

/// Releases the Wgpu GPU upload slot on the geometry's runtime back to None.
pub fn destroy_mesh_geometry_wgpu_data(geometry: &mut MeshGeometry) {
    geometry.runtime.webgpu_data = None;
}

/// Returns the number of indices in the geometry's index buffer, or 0 for non-indexed geometry.
pub fn get_mesh_geometry_index_count(geometry: &MeshGeometry) -> u32 {
    return match &geometry.indices {
        IndexBuffer::U16(v) => v.len() as u32,
        IndexBuffer::U32(v) => v.len() as u32,
        IndexBuffer::None => 0,
    };
}

/// Returns the CPU-morph base pose cached on the geometry's runtime, or None before
/// the first morph capture.
pub fn get_mesh_geometry_morph_bind_pose(geometry: &MeshGeometry) -> Option<&MeshMorphBindPose> {
    return geometry.runtime.morph_bind_pose.as_ref();
}

/// Returns the CPU-skinning bind pose cached on the geometry's runtime, or None before
/// the first skin capture.
pub fn get_mesh_geometry_skin_bind_pose(geometry: &MeshGeometry) -> Option<&MeshSkinBindPose> {
    return geometry.runtime.skin_bind_pose.as_ref();
}

/// Returns the number of vertices, derived from the interleaved vertex stream and the
/// layout stride.
pub fn get_mesh_geometry_vertex_count(geometry: &MeshGeometry) -> u32 {
    return get_vertex_count_from_layout(&geometry.vertices, &geometry.layout);
}

/// Returns true when the geometry's vertex layout carries the joints0 skinning channel.
pub fn has_mesh_geometry_skin(geometry: &MeshGeometry) -> bool {
    let attributes = &geometry.layout.attributes;
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

/// Stores (or clears) the CPU-morph base pose on the geometry's runtime.
pub fn set_mesh_geometry_morph_bind_pose(geometry: &mut MeshGeometry, bind_pose: Option<MeshMorphBindPose>) {
    geometry.runtime.morph_bind_pose = bind_pose;
}

/// Stores (or clears) the CPU-skinning bind pose on the geometry's runtime.
pub fn set_mesh_geometry_skin_bind_pose(geometry: &mut MeshGeometry, bind_pose: Option<MeshSkinBindPose>) {
    geometry.runtime.skin_bind_pose = bind_pose;
}

fn get_vertex_count_from_layout(vertices: &[f32], layout: &VertexAttributeLayout) -> u32 {
    let floats_per_vertex = layout.stride / 4;
    if floats_per_vertex == 0 {
        return 0;
    }
    return (vertices.len() as u32) / floats_per_vertex;
}

fn promote_indices(source: IndexBuffer, vertex_count: u32) -> IndexBuffer {
    return match source {
        IndexBuffer::U16(v) => {
            if vertex_count > UINT16_INDEX_CEILING {
                let out: Vec<u32> = v.iter().map(|&x| x as u32).collect();
                IndexBuffer::U32(out)
            } else {
                IndexBuffer::U16(v)
            }
        }
        IndexBuffer::U32(v) => IndexBuffer::U32(v),
        IndexBuffer::None => IndexBuffer::None,
    };
}

/// Returns the index value at the given element position.
pub fn get_index_value(indices: &IndexBuffer, element: usize) -> u32 {
    return match indices {
        IndexBuffer::U16(v) => v[element] as u32,
        IndexBuffer::U32(v) => v[element],
        IndexBuffer::None => element as u32,
    };
}

/// Returns the number of elements in the index buffer.
pub fn get_index_count(indices: &IndexBuffer) -> usize {
    return match indices {
        IndexBuffer::U16(v) => v.len(),
        IndexBuffer::U32(v) => v.len(),
        IndexBuffer::None => 0,
    };
}
