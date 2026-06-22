//! Mesh geometry header types — the cross-crate contract for `flighthq-mesh`,
//! `flighthq-scene`, and the `scene-*` renderers.
//!
//! Handedness is pinned across the 3D suite: right-handed coordinates, CCW
//! front-face, and the tangent `w` component is the bitangent sign per glTF
//! (`bitangent = cross(normal, tangent.xyz) * tangent.w`). The canonical
//! interleaved PBR vertex record is
//! `position(3) + normal(3) + tangent(4, w = handedness) + uv0(2) = 12 f32 / 48 bytes`,
//! laid out so one record maps 1:1 to a GL `vertexAttribPointer` table, a
//! `GPUVertexBufferLayout`, and a C `offsetof` table. `joints0`/`weights0`/
//! `color0` are reserved semantics for a later skinning and vertex-color pass.
//! Index data auto-promotes `u16` -> `u32` past 65k vertices.

use crate::entity::{Entity, EntityRuntime};
use crate::geometry::Aabb;

/// The role an attribute plays, independent of its numeric format. Renderers
/// bind by semantic.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub enum VertexSemantic {
    Position,
    Normal,
    Tangent,
    Uv0,
    Uv1,
    Color0,
    Joints0,
    Weights0,
}

/// The numeric encoding of one attribute within an interleaved vertex record.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub enum VertexFormat {
    Float32x2,
    Float32x3,
    Float32x4,
    Uint8x4,
    Unorm8x4,
    Uint16x4,
}

/// How the index/vertex stream assembles into primitives. Default is
/// triangle-list.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum PrimitiveTopology {
    PointList,
    LineList,
    LineStrip,
    #[default]
    TriangleList,
    TriangleStrip,
}

/// One attribute's placement inside the interleaved vertex record: its
/// semantic, its numeric format, and its byte offset from the start of the
/// record. `byte_offset` plus the layout's `stride` are exactly the GL
/// `vertexAttribPointer` arguments / `GPUVertexAttribute` fields.
#[derive(Copy, Clone, PartialEq, Eq, Debug)]
pub struct VertexAttribute {
    pub byte_offset: u32,
    pub format: VertexFormat,
    pub semantic: VertexSemantic,
}

/// The full interleaved-vertex description: the per-vertex `stride` in bytes
/// and the ordered set of attributes packed into each record.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct VertexAttributeLayout {
    pub attributes: Vec<VertexAttribute>,
    pub stride: u32,
}

/// A contiguous draw range within the geometry's index buffer, addressing one
/// material binding. `index_offset` is the first index (in elements, not
/// bytes); `index_count` is how many indices. A geometry with a single material
/// is one subset spanning the whole index buffer.
#[derive(Copy, Clone, PartialEq, Eq, Debug, Default)]
pub struct MeshSubset {
    pub index_count: u32,
    pub index_offset: u32,
}

/// The index buffer storage: `u16` for small meshes, `u32` once vertex count
/// passes 65k. `None` (on `MeshGeometry::indices`) denotes non-indexed geometry.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum MeshIndices {
    U16(Vec<u16>),
    U32(Vec<u32>),
}

/// Interleaved CPU mesh data: one vertex buffer described by `layout`, an index
/// buffer, the primitive topology, and the subset ranges. `vertices` is the raw
/// interleaved record bytes (read through `layout`); `indices` is `None` for
/// non-indexed geometry. `bounds` is the cached local-space AABB (`None` until
/// computed). `version` is bumped whenever `vertices`/`indices` change so
/// backends know to re-upload. GPU handles live on the paired runtime, never
/// here.
#[derive(Clone, Debug)]
pub struct MeshGeometry {
    pub bounds: Option<Aabb>,
    pub indices: Option<MeshIndices>,
    pub layout: VertexAttributeLayout,
    pub subsets: Vec<MeshSubset>,
    pub topology: PrimitiveTopology,
    pub version: u32,
    pub vertices: Vec<f32>,
}

impl Entity for MeshGeometry {}

/// Opaque per-render-state GPU upload of a `MeshGeometry` for the Gl backend
/// (VAO + buffers + uploaded `version`). `scene-gl` owns and downcasts the
/// concrete type. `None` until the geometry is first uploaded.
pub trait MeshGeometryGlData: std::any::Any + std::fmt::Debug + Send + Sync {}

/// Opaque per-render-state GPU upload of a `MeshGeometry` for the Wgpu backend.
/// `scene-wgpu` owns and downcasts the concrete type. `None` until first upload.
pub trait MeshGeometryWgpuData: std::any::Any + std::fmt::Debug + Send + Sync {}

/// Package-private companion to a `MeshGeometry`. Each backend stores its named
/// GPU upload slot here, initialized to `None` and filled lazily on first draw.
/// Subsystems read/write only the slot they own.
#[derive(Default)]
pub struct MeshGeometryRuntime {
    pub webgl_data: Option<Box<dyn MeshGeometryGlData>>,
    pub webgpu_data: Option<Box<dyn MeshGeometryWgpuData>>,
}

impl EntityRuntime for MeshGeometryRuntime {
    fn binding(&self) -> Option<&dyn std::any::Any> {
        None
    }
}

/// Canonical PascalCase kind name for a mesh leaf node. The runtime [`KindId`]
/// is constructed at the owning crate (`flighthq-mesh`).
///
/// [`KindId`]: crate::kind::KindId
pub const MESH_KIND_NAME: &str = "Mesh";
