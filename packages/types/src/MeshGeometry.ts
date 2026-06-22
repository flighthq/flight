import type { Aabb } from './AABB';
import type { Entity, EntityRuntime } from './Entity';

// Handedness is pinned across the 3D suite: right-handed coordinates, CCW front-face, and the
// tangent `w` component is the bitangent sign per glTF (bitangent = cross(normal, tangent.xyz)
// * tangent.w). The canonical interleaved PBR vertex record is
//   position(3) + normal(3) + tangent(4, w = handedness) + uv0(2) = 12 f32 / 48 bytes,
// laid out so one record maps 1:1 to a GL vertexAttribPointer table, a GPUVertexBufferLayout,
// and a C offsetof table. joints0/weights0/color0 are reserved semantics for a later skinning
// and vertex-color pass. Index data auto-promotes Uint16 -> Uint32 past 65k vertices.

// The role an attribute plays, independent of its numeric format. Renderers bind by semantic.
export type VertexSemantic = 'color0' | 'joints0' | 'normal' | 'position' | 'tangent' | 'uv0' | 'uv1' | 'weights0';

// The numeric encoding of one attribute within an interleaved vertex record.
export type VertexFormat = 'float32x2' | 'float32x3' | 'float32x4' | 'uint16x4' | 'uint8x4' | 'unorm8x4';

// How the index/vertex stream assembles into primitives. Default is triangle-list.
export type PrimitiveTopology = 'line-list' | 'line-strip' | 'point-list' | 'triangle-list' | 'triangle-strip';

// One attribute's placement inside the interleaved vertex record: its semantic, its numeric
// format, and its byte offset from the start of the record. `byteOffset` plus the layout's
// `stride` are exactly the GL vertexAttribPointer arguments / GPUVertexAttribute fields.
export interface VertexAttribute {
  byteOffset: number;
  format: VertexFormat;
  semantic: VertexSemantic;
}

// The full interleaved-vertex description: the per-vertex `stride` in bytes and the ordered
// set of attributes packed into each record. One layout describes one interleaved vertex
// buffer (the canonical record above is the default).
export interface VertexAttributeLayout {
  attributes: readonly VertexAttribute[];
  stride: number;
}

// A contiguous draw range within the geometry's index buffer, addressing one material binding.
// `indexOffset` is the first index (in elements, not bytes); `indexCount` is how many indices.
// A geometry with a single material is one subset spanning the whole index buffer.
export interface MeshSubset {
  indexCount: number;
  indexOffset: number;
}

// Interleaved CPU mesh data: one vertex buffer described by `layout`, an index buffer, the
// primitive topology, and the subset ranges. `vertices` is the raw interleaved record bytes
// (read through `layout`); `indices` is null for non-indexed geometry. `bounds` is the cached
// local-space AABB (null until computed by computeMeshGeometryBounds). `version` is bumped
// whenever `vertices`/`indices` change so backends know to re-upload (see
// destroyMeshGeometryGPUData). GPU handles live on the paired runtime, never here.
export interface MeshGeometry extends Entity {
  bounds: Aabb | null;
  indices: Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer> | null;
  layout: VertexAttributeLayout;
  subsets: readonly MeshSubset[];
  topology: PrimitiveTopology;
  version: number;
  vertices: Float32Array<ArrayBuffer>;
}

// Opaque per-render-state GPU upload of a MeshGeometry for the Gl2 backend (VAO + buffers +
// uploaded `version`). Branded so the header names the slot without leaking the GL types;
// scene-gl owns and casts the concrete shape. Null until the geometry is first uploaded.
export interface MeshGeometryGlData {
  readonly __meshGeometryGlData: unique symbol;
}

// Opaque per-render-state GPU upload of a MeshGeometry for the Wgpu backend (vertex/index
// GPUBuffers + uploaded `version`). Branded; scene-wgpu owns and casts the concrete shape.
// Null until the geometry is first uploaded.
export interface MeshGeometryWgpuData {
  readonly __meshGeometryWgpuData: unique symbol;
}

// Package-private companion to a MeshGeometry. Each backend stores its named GPU upload slot
// here, initialized to null and filled lazily on first draw; destroyMeshGeometryGPUData frees
// them. Subsystems read/write only the slot they own.
export interface MeshGeometryRuntime extends EntityRuntime {
  webglData: MeshGeometryGlData | null;
  webgpuData: MeshGeometryWgpuData | null;
}
